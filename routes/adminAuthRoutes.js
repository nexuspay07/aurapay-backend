const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/User");
const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");
const createAuditLog = require("../utils/createAuditLog");
const AdminInvitation = require("../models/AdminInvitation");
const { sendAdminInvitationEmail, sendAdminPasswordResetEmail } = require("../services/emailService");
const { ADMIN_ROLES, ALL_ADMIN_PERMISSIONS, ROLE_PERMISSIONS, effectivePermissions, hasPermission } = require("../config/adminPermissions");

const router = express.Router();
const attempts = new Map();
const LIMIT = Number(process.env.ADMIN_LOGIN_LIMIT || 5);
const WINDOW_MS = Number(process.env.ADMIN_LOGIN_WINDOW_MS || 15 * 60 * 1000);

function envelopeError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}
function loginKey(req, email) {
  return `${req.ip || req.socket?.remoteAddress || "unknown"}:${String(email || "").trim().toLowerCase()}`;
}
function limited(key) {
  const now = Date.now();
  const item = attempts.get(key);
  if (!item || item.resetAt <= now) { attempts.set(key, { count: 0, resetAt: now + WINDOW_MS }); return false; }
  return item.count >= LIMIT;
}
function recordFailure(key) { const item = attempts.get(key); if (item) item.count += 1; }
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const strongPassword = (password) => typeof password === "string" && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/.test(password);
function canAssignRole(actor, role) {
  if (!ADMIN_ROLES.includes(role)) return false;
  if (actor.role === "super_admin") return true;
  return role !== "super_admin" && (ROLE_PERMISSIONS[role] || []).every((item) => hasPermission(actor, item));
}
const roleRank = { auditor: 1, support_admin: 2, risk_admin: 3, finance_admin: 3, super_admin: 4 };
function publicAdmin(admin) { return { id: admin._id, email: admin.email, role: admin.role, status: admin.adminDisabled ? "disabled" : "active", adminDisabled: admin.adminDisabled, lastLogin: admin.lastLogin, createdAt: admin.createdAt, permissions: effectivePermissions(admin) }; }

router.post("/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) return envelopeError(res, 400, "INVALID_LOGIN_BODY", "Email and password are required.");
  const key = loginKey(req, email);
  if (limited(key)) return envelopeError(res, 429, "LOGIN_RATE_LIMITED", "Too many login attempts. Try again later.");
  try {
    const user = await User.findOne({ email }).select("+password +adminSecurityVersion");
    const match = user?.password ? await bcrypt.compare(password, user.password) : false;
    if (!user || !match || !ADMIN_ROLES.includes(user.role) || user.adminDisabled || user.frozen) {
      recordFailure(key);
      await createAuditLog({ admin: user?._id, actorEmail: email, action: "admin.login.failed", targetType: "admin_session", severity: "medium", metadata: { reason: "credentials_or_access_denied" }, req });
      return envelopeError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }
    attempts.delete(key);
    const permissions = effectivePermissions(user);
    const token = jwt.sign({ id: user._id, email: user.email, role: user.role, adminSecurityVersion: Number(user.adminSecurityVersion || 0) }, process.env.JWT_SECRET, { expiresIn: "7d" });
    user.lastLogin = new Date(); user.lastLoginIP = req.ip || null; await user.save();
    await createAuditLog({ admin: user._id, actorEmail: user.email, action: "admin.login.success", targetType: "admin_session", targetId: user._id, req });
    return res.json({ success: true, data: { token, admin: { id: user._id, email: user.email, role: user.role, permissions, status: user.status } } });
  } catch { return envelopeError(res, 500, "ADMIN_LOGIN_FAILED", "Admin login failed."); }
});

router.get("/me", auth, adminAuth, (req, res) => res.json({ success: true, data: { admin: { id: req.user._id, email: req.user.email, role: req.user.role, permissions: effectivePermissions(req.user), status: req.user.status } } }));

router.post("/create-admin", auth, adminAuth, permission("admin:create"), async (req, res) => {
  try {
    const { email, password, role, permissions: requested } = req.body || {};
    if (typeof email !== "string" || !validEmail(email.trim().toLowerCase()) || !strongPassword(password) || !ADMIN_ROLES.includes(role)) return envelopeError(res, 400, "INVALID_ADMIN", "A valid email, role, and password meeting the admin password policy are required.");
    if (!canAssignRole(req.user, role)) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "That role cannot be assigned by this administrator.");
    const granted = requested === undefined ? ROLE_PERMISSIONS[role] : requested;
    if (!Array.isArray(granted) || granted.some((item) => !ALL_ADMIN_PERMISSIONS.includes(item) || !hasPermission(req.user, item))) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "Permissions cannot exceed the acting admin's scope.");
    if (await User.exists({ email: email.trim().toLowerCase() })) return envelopeError(res, 409, "ADMIN_EXISTS", "User already exists.");
    const created = await User.create({ email, password: await bcrypt.hash(password, 10), role, permissions: granted, status: "verified" });
    await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin_created", targetType: "admin", targetId: created._id, targetLabel: created.email, severity: "high", metadata: { role, permissions: granted }, req });
    return res.status(201).json({ success: true, data: { admin: { id: created._id, email: created.email, role, permissions: effectivePermissions(created) } } });
  } catch { return envelopeError(res, 500, "ADMIN_CREATE_FAILED", "Failed to create admin."); }
});

router.get("/admins", auth, adminAuth, permission("admin:view"), async (req, res) => {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } }).select("-password").sort({ createdAt: -1 });
  const invites = await AdminInvitation.find({ acceptedBy: { $in: admins.map((a) => a._id) } }).populate("invitedBy", "email"); const byUser = new Map(invites.map((i) => [String(i.acceptedBy), i.invitedBy?.email || null]));
  res.json({ success: true, data: admins.map((item) => ({ ...publicAdmin(item), invitedBy: byUser.get(String(item._id)) || null })) });
});

router.post("/invitations", auth, adminAuth, permission("admin:create"), async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""; const role = req.body?.role;
    if (!validEmail(email) || !ADMIN_ROLES.includes(role)) return envelopeError(res, 400, "INVALID_INVITATION", "A valid email and admin role are required.");
    if (!canAssignRole(req.user, role)) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "That role cannot be assigned by this administrator.");
    if (await User.exists({ email })) return envelopeError(res, 409, "ADMIN_EXISTS", "An account already exists for this email.");
    if (await AdminInvitation.exists({ email, status: "pending", expiresAt: { $gt: new Date() } })) return envelopeError(res, 409, "INVITATION_PENDING", "A pending invitation already exists.");
    const token = crypto.randomBytes(32).toString("hex"); const permissions = ROLE_PERMISSIONS[role] || [];
    const invitation = await AdminInvitation.create({ email, role, permissions, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + Number(process.env.ADMIN_INVITE_TTL_MS || 86400000)), invitedBy: req.user._id });
    await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin.invitation.created", targetType: "admin_invitation", targetId: invitation._id, targetLabel: email, severity: "high", metadata: { role, expiresAt: invitation.expiresAt }, req });
    let delivered = true; try { await sendAdminInvitationEmail(invitation, token); } catch { delivered = false; }
    if (!delivered && process.env.NODE_ENV === "production") return envelopeError(res, 502, "INVITATION_DELIVERY_FAILED", "Invitation created but email delivery failed.");
    const data = { invitation: { id: invitation._id, email, role, status: invitation.status, expiresAt: invitation.expiresAt }, delivery: delivered ? "email" : "development_link" };
    if (!delivered && process.env.NODE_ENV !== "production") data.developmentInviteLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/admin-invitation/${token}`;
    return res.status(201).json({ success: true, data });
  } catch { return envelopeError(res, 500, "INVITATION_CREATE_FAILED", "Unable to create invitation."); }
});

router.get("/invitations", auth, adminAuth, permission("admin:view"), async (req, res) => {
  const rows = await AdminInvitation.find().populate("invitedBy", "email").sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: rows.map((row) => ({ id: row._id, email: row.email, role: row.role, status: row.status === "pending" && row.expiresAt < new Date() ? "expired" : row.status, invitedBy: row.invitedBy?.email || null, createdAt: row.createdAt, expiresAt: row.expiresAt, acceptedAt: row.acceptedAt, revokedAt: row.revokedAt })) });
});

async function rotateInvitation(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return envelopeError(res, 400, "INVALID_ID", "Invalid invitation ID.");
  const invitation = await AdminInvitation.findById(req.params.id).select("+tokenHash");
  if (!invitation || invitation.status !== "pending") return envelopeError(res, 409, "INVITATION_NOT_PENDING", "Invitation is not pending.");
  if (!canAssignRole(req.user, invitation.role)) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "That invitation cannot be managed by this administrator.");
  const token = crypto.randomBytes(32).toString("hex"); invitation.tokenHash = hashToken(token); invitation.expiresAt = new Date(Date.now() + Number(process.env.ADMIN_INVITE_TTL_MS || 86400000)); await invitation.save();
  await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin.invitation.resent", targetType: "admin_invitation", targetId: invitation._id, targetLabel: invitation.email, severity: "high", metadata: { role: invitation.role, expiresAt: invitation.expiresAt }, req });
  let delivered = true; try { await sendAdminInvitationEmail(invitation, token); } catch { delivered = false; }
  const data = { invitation: { id: invitation._id, expiresAt: invitation.expiresAt }, delivery: delivered ? "email" : "development_link" }; if (!delivered && process.env.NODE_ENV !== "production") data.developmentInviteLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/admin-invitation/${token}`;
  res.json({ success: true, data });
}
router.post("/invitations/:id/resend", auth, adminAuth, permission("admin:create"), rotateInvitation);
router.patch("/invitations/:id/revoke", auth, adminAuth, permission("admin:update"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return envelopeError(res, 400, "INVALID_ID", "Invalid invitation ID."); const invitation = await AdminInvitation.findById(req.params.id);
  if (!invitation || invitation.status !== "pending") return envelopeError(res, 409, "INVITATION_NOT_PENDING", "Invitation is not pending."); if (!canAssignRole(req.user, invitation.role)) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "That invitation cannot be managed.");
  invitation.status = "revoked"; invitation.revokedAt = new Date(); await invitation.save(); await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin.invitation.revoked", targetType: "admin_invitation", targetId: invitation._id, targetLabel: invitation.email, severity: "high", metadata: { role: invitation.role }, req }); res.json({ success: true, data: { id: invitation._id, status: invitation.status } });
});

router.get("/invitations/:token", async (req, res) => {
  const invitation = await AdminInvitation.findOne({ tokenHash: hashToken(req.params.token) }).select("+tokenHash");
  if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date()) return envelopeError(res, 400, "INVALID_INVITATION", "This invitation is invalid or has expired.");
  res.json({ success: true, data: { email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt } });
});
router.post("/invitations/:token/accept", async (req, res) => {
  if (!strongPassword(req.body?.password)) return envelopeError(res, 400, "WEAK_PASSWORD", "Use at least 10 characters with uppercase, lowercase, and a number.");
  const invitation = await AdminInvitation.findOne({ tokenHash: hashToken(req.params.token) }).select("+tokenHash");
  if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date()) return envelopeError(res, 400, "INVALID_INVITATION", "This invitation is invalid or has expired.");
  if (await User.exists({ email: invitation.email })) return envelopeError(res, 409, "ADMIN_EXISTS", "Admin access is already active.");
  const created = await User.create({ email: invitation.email, password: await bcrypt.hash(req.body.password, 10), role: invitation.role, permissions: invitation.permissions, status: "verified", emailVerified: true }); invitation.status = "accepted"; invitation.acceptedBy = created._id; invitation.acceptedAt = new Date(); await invitation.save();
  await createAuditLog({ admin: created._id, actorEmail: invitation.email, action: "admin.invitation.accepted", targetType: "admin", targetId: created._id, targetLabel: created.email, severity: "high", metadata: { invitationId: String(invitation._id), invitedBy: String(invitation.invitedBy), role: created.role }, req });
  res.status(201).json({ success: true, data: { message: "Admin access activated. You can now sign in." } });
});

router.post("/forgot-password", async (req, res) => {
  const message = "If an eligible account exists, reset instructions have been sent."; const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (validEmail(email)) { const user = await User.findOne({ email, role: { $in: ADMIN_ROLES }, adminDisabled: { $ne: true } }); if (user) { const token = crypto.randomBytes(32).toString("hex"); user.passwordResetToken = hashToken(token); user.passwordResetExpires = new Date(Date.now() + 3600000); await user.save(); await createAuditLog({ admin: user._id, actorEmail: user.email, action: "admin.password.reset.requested", targetType: "admin", targetId: user._id, targetLabel: user.email, severity: "medium", metadata: { expiresAt: user.passwordResetExpires }, req }); try { await sendAdminPasswordResetEmail(user, token); } catch {} } }
  res.json({ success: true, data: { message } });
});
router.post("/reset-password/:token", async (req, res) => {
  if (!strongPassword(req.body?.password)) return envelopeError(res, 400, "WEAK_PASSWORD", "Use at least 10 characters with uppercase, lowercase, and a number."); const user = await User.findOne({ passwordResetToken: hashToken(req.params.token), passwordResetExpires: { $gt: new Date() }, role: { $in: ADMIN_ROLES } }).select("+passwordResetToken +adminSecurityVersion");
  if (!user) return envelopeError(res, 400, "INVALID_RESET", "This reset link is invalid or has expired."); user.password = await bcrypt.hash(req.body.password, 10); user.passwordResetToken = null; user.passwordResetExpires = null; user.loginAttempts = 0; user.lockedUntil = null; user.adminSecurityVersion = Number(user.adminSecurityVersion || 0) + 1; await user.save(); await createAuditLog({ admin: user._id, actorEmail: user.email, action: "admin.password.reset.completed", targetType: "admin", targetId: user._id, targetLabel: user.email, severity: "high", metadata: { sessionsInvalidated: true, securityVersion: user.adminSecurityVersion }, req }); res.json({ success: true, data: { message: "Password reset complete. You can now sign in." } });
});

router.patch("/admins/:id", auth, adminAuth, permission("admin:update"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return envelopeError(res, 400, "INVALID_ID", "Invalid admin ID.");
  const target = await User.findById(req.params.id).select("+adminSecurityVersion");
  if (!target || !ADMIN_ROLES.includes(target.role)) return envelopeError(res, 404, "ADMIN_NOT_FOUND", "Admin not found.");
  const nextRole = req.body.role ?? target.role; const nextDisabled = req.body.adminDisabled ?? target.adminDisabled;
  const nextPermissions = req.body.permissions ?? target.permissions;
  if (target.role === "super_admin" && req.user.role !== "super_admin") return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "Only a super admin can modify a super admin.");
  if (roleRank[target.role] > roleRank[req.user.role]) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "A higher-privilege administrator cannot be modified.");
  if (!canAssignRole(req.user, nextRole)) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "That role exceeds the acting admin's scope.");
  if (!ADMIN_ROLES.includes(nextRole) || !Array.isArray(nextPermissions) || nextPermissions.some((p) => !ALL_ADMIN_PERMISSIONS.includes(p) || !hasPermission(req.user, p))) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "Role or permissions exceed the acting admin's scope.");
  if (String(target._id) === String(req.user._id) && (nextDisabled || nextRole !== target.role)) return envelopeError(res, 409, "CURRENT_ADMIN_PROTECTED", "You cannot disable or change your own role.");
  if (target.role === "super_admin" && (nextDisabled || nextRole !== "super_admin")) {
    const remaining = await User.countDocuments({ role: "super_admin", adminDisabled: { $ne: true }, _id: { $ne: target._id } });
    if (!remaining) return envelopeError(res, 409, "LAST_SUPER_ADMIN", "The last active super admin cannot be disabled or demoted.");
  }
  const before = { role: target.role, permissions: target.permissions, adminDisabled: target.adminDisabled };
  const securityChanged = before.role !== nextRole || before.adminDisabled !== nextDisabled || JSON.stringify([...before.permissions].sort()) !== JSON.stringify([...nextPermissions].sort());
  target.role = nextRole; target.permissions = nextPermissions; target.adminDisabled = nextDisabled; if (securityChanged) target.adminSecurityVersion = Number(target.adminSecurityVersion || 0) + 1; await target.save();
  const action = before.role !== nextRole ? "admin.role.changed" : before.adminDisabled !== nextDisabled ? (nextDisabled ? "admin.disabled" : "admin.enabled") : "admin.permissions.changed";
  await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action, targetType: "admin", targetId: target._id, targetLabel: target.email, severity: "high", metadata: { before, after: { role: nextRole, permissions: nextPermissions, adminDisabled: nextDisabled }, sessionsInvalidated: securityChanged }, req });
  if (securityChanged) await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin.session.invalidated", targetType: "admin", targetId: target._id, targetLabel: target.email, severity: "high", metadata: { reason: action, securityVersion: target.adminSecurityVersion }, req });
  res.json({ success: true, data: { admin: { id: target._id, email: target.email, role: target.role, permissions: effectivePermissions(target), adminDisabled: target.adminDisabled } } });
});

router.patch("/admins/:id/status", auth, adminAuth, permission("admin:update"), (req, res, next) => {
  if (!["active", "disabled"].includes(req.body?.status)) return envelopeError(res, 400, "INVALID_STATUS", "Status must be active or disabled.");
  req.body = { ...req.body, adminDisabled: req.body.status === "disabled" }; next();
}, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return envelopeError(res, 400, "INVALID_ID", "Invalid admin ID."); const target = await User.findById(req.params.id).select("+adminSecurityVersion");
  if (!target || !ADMIN_ROLES.includes(target.role)) return envelopeError(res, 404, "ADMIN_NOT_FOUND", "Admin not found."); if (String(target._id) === String(req.user._id)) return envelopeError(res, 409, "CURRENT_ADMIN_PROTECTED", "You cannot change your own access status."); if (roleRank[target.role] > roleRank[req.user.role]) return envelopeError(res, 403, "PRIVILEGE_ESCALATION", "A higher-privilege administrator cannot be modified.");
  const disabled = req.body.adminDisabled; if (target.role === "super_admin" && disabled && !await User.exists({ role: "super_admin", adminDisabled: { $ne: true }, _id: { $ne: target._id } })) return envelopeError(res, 409, "LAST_SUPER_ADMIN", "The last active super admin cannot be disabled.");
  const before = target.adminDisabled; if (before !== disabled) target.adminSecurityVersion = Number(target.adminSecurityVersion || 0) + 1; target.adminDisabled = disabled; await target.save(); await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: disabled ? "admin.disabled" : "admin.enabled", targetType: "admin", targetId: target._id, targetLabel: target.email, severity: "high", metadata: { before, after: disabled, sessionsInvalidated: before !== disabled }, req }); if (before !== disabled) await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin.session.invalidated", targetType: "admin", targetId: target._id, targetLabel: target.email, severity: "high", metadata: { reason: disabled ? "admin.disabled" : "admin.enabled", securityVersion: target.adminSecurityVersion }, req }); res.json({ success: true, data: { admin: publicAdmin(target) } });
});

module.exports = router;
