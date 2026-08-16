const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");
const User = require("../models/User");
const Merchant = require("../models/Merchant");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const ApiLog = require("../models/ApiLog");
const FraudLog = require("../models/FraudLog");
const AuditLog = require("../models/AuditLog");
const createAuditLog = require("../utils/createAuditLog");
const { ADMIN_ROLES, hasPermission } = require("../config/adminPermissions");
const { isMerchantRole } = require("../services/merchantSessionSecurity");

const router = express.Router();
router.use(auth, adminAuth);
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const pageOptions = (query) => ({ page: Math.max(1, Number(query.page) || 1), limit: Math.min(100, Math.max(1, Number(query.limit) || 25)) });
function dates(query, field = "createdAt") { const value = {}; if (query.dateFrom) value.$gte = new Date(query.dateFrom); if (query.dateTo) value.$lte = new Date(query.dateTo); return Object.keys(value).length ? { [field]: value } : {}; }
function sortOf(query, allowed) { const field = allowed.includes(query.sortBy) ? query.sortBy : "createdAt"; return { [field]: query.sortOrder === "asc" ? 1 : -1 }; }

router.get("/test", (req, res) => res.json({ success: true, data: { email: req.user.email, role: req.user.role } }));

router.get("/users", permission("user:view"), async (req, res) => {
  const users = await User.find().select("-password -refreshToken -passwordResetToken -emailVerificationToken").sort({ createdAt: -1 });
  res.json({ success: true, data: users });
});

router.post("/users/:id/freeze", permission("user:freeze"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "INVALID_ID", "Invalid user ID.");
  const hours = Number(req.body?.hours); const freezeUntil = Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600000) : null;
  const target = await User.findById(req.params.id).select("+adminSecurityVersion +merchantSecurityVersion");
  if (!target) return fail(res, 404, "USER_NOT_FOUND", "User not found.");
  if (ADMIN_ROLES.includes(target.role) && (req.user.role !== "super_admin" || !hasPermission(req.user, "admin:update") || String(target._id) === String(req.user._id))) return fail(res, 403, "ADMIN_SCOPE_REQUIRED", "Administrator restrictions require higher management authority.");
  const versionField = ADMIN_ROLES.includes(target.role)
    ? "adminSecurityVersion"
    : isMerchantRole(target.role)
    ? "merchantSecurityVersion"
    : null;
  const update = {
    $set: {
      frozen: true,
      freezeUntil,
      freezeReason: req.body?.reason || "Admin freeze",
      ...(isMerchantRole(target.role) ? { refreshToken: null, refreshTokenExpires: null } : {}),
    },
  };
  if (versionField) update.$inc = { [versionField]: 1 };
  const user = await User.findByIdAndUpdate(target._id, update, { new: true })
    .select("+adminSecurityVersion +merchantSecurityVersion");
  if (!user) return fail(res, 404, "USER_NOT_FOUND", "User not found.");
  await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "user_frozen", targetType: "user", targetId: user._id, targetLabel: user.email, severity: "high", metadata: { reason: req.body?.reason || null, hours: Number.isFinite(hours) ? hours : null, previousVersion: versionField ? Number(target[versionField] || 0) : null, newVersion: versionField ? Number(user[versionField] || 0) : null, sessionsInvalidated: Boolean(versionField) }, req });
  if (ADMIN_ROLES.includes(user.role)) await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin.session.invalidated", targetType: "admin", targetId: user._id, targetLabel: user.email, severity: "high", metadata: { reason: "admin.frozen", securityVersion: user.adminSecurityVersion }, req });
  if (isMerchantRole(user.role)) await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "merchant.session.invalidated", targetType: "merchant_session", targetId: user._id, targetLabel: user.email, severity: "high", metadata: { reason: "merchant.frozen", previousVersion: Number(target.merchantSecurityVersion || 0), newVersion: Number(user.merchantSecurityVersion || 0) }, req });
  res.json({ success: true, data: user });
});

router.post("/users/:id/unfreeze", permission("user:freeze"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "INVALID_ID", "Invalid user ID.");
  const target = await User.findById(req.params.id).select("+adminSecurityVersion +merchantSecurityVersion");
  if (!target) return fail(res, 404, "USER_NOT_FOUND", "User not found.");
  if (ADMIN_ROLES.includes(target.role) && (req.user.role !== "super_admin" || !hasPermission(req.user, "admin:update") || String(target._id) === String(req.user._id))) return fail(res, 403, "ADMIN_SCOPE_REQUIRED", "Administrator restrictions require higher management authority.");
  const versionField = ADMIN_ROLES.includes(target.role)
    ? "adminSecurityVersion"
    : isMerchantRole(target.role)
    ? "merchantSecurityVersion"
    : null;
  const update = { $set: { frozen: false, freezeUntil: null, freezeReason: null, ...(isMerchantRole(target.role) ? { refreshToken: null, refreshTokenExpires: null } : {}) } };
  if (versionField) update.$inc = { [versionField]: 1 };
  const user = await User.findByIdAndUpdate(target._id, update, { new: true }).select("+adminSecurityVersion +merchantSecurityVersion");
  await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "user_unfrozen", targetType: "user", targetId: user._id, targetLabel: user.email, severity: "medium", metadata: { previousVersion: versionField ? Number(target[versionField] || 0) : null, newVersion: versionField ? Number(user[versionField] || 0) : null, sessionsInvalidated: Boolean(versionField) }, req });
  if (ADMIN_ROLES.includes(user.role)) await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "admin.session.invalidated", targetType: "admin", targetId: user._id, targetLabel: user.email, severity: "high", metadata: { reason: "admin.unfrozen", securityVersion: user.adminSecurityVersion }, req });
  if (isMerchantRole(user.role)) await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "merchant.session.invalidated", targetType: "merchant_session", targetId: user._id, targetLabel: user.email, severity: "high", metadata: { reason: "merchant.unfrozen", previousVersion: Number(target.merchantSecurityVersion || 0), newVersion: Number(user.merchantSecurityVersion || 0) }, req });
  res.json({ success: true, data: user });
});

router.get("/metrics", permission("analytics:view"), async (req, res) => {
  const environment = req.query.environment || "sandbox";
  if (!['sandbox', 'live'].includes(environment)) return fail(res, 400, "INVALID_ENVIRONMENT", "Environment must be sandbox or live.");
  if (req.query.merchant && !mongoose.isValidObjectId(req.query.merchant)) return fail(res, 400, "INVALID_ID", "Invalid merchant ID.");
  const match = { environment, livemode: environment === "live", ...(req.query.merchant ? { merchant: new mongoose.Types.ObjectId(req.query.merchant) } : {}) };
  const [summaries, pendingSettlements, completedSettlements, activeMerchants, apiRequests] = await Promise.all([
    Transaction.aggregate([{ $match: match }, { $group: { _id: { $toLower: "$currency" }, totalTransactions: { $sum: 1 }, successfulPayments: { $sum: { $cond: [{ $in: ["$status", ["completed", "refunded"]] }, 1, 0] } }, failedPayments: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } }, grossVolume: { $sum: { $cond: [{ $in: ["$status", ["completed", "refunded"]] }, "$amount", 0] } }, fees: { $sum: { $ifNull: ["$merchantFee", { $ifNull: ["$estimatedFee", 0] }] } }, netMerchantValue: { $sum: { $ifNull: ["$merchantNet", { $ifNull: ["$estimatedNet", 0] }] } }, refunds: { $sum: { $ifNull: ["$refund.refundAmount", 0] } } } }]),
    Settlement.countDocuments({ ...match, status: "pending" }), Settlement.countDocuments({ ...match, status: "completed" }),
    Transaction.distinct("merchant", match).then((ids) => Merchant.countDocuments({ _id: { $in: ids }, active: true })), ApiLog.countDocuments({ environment, ...(req.query.merchant ? { merchant: match.merchant } : {}) }),
  ]);
  const monetaryByCurrency = summaries.map(({ _id, grossVolume, fees, netMerchantValue, refunds }) => ({ currency: _id || "unknown", grossVolume, fees, netMerchantValue, refunds }));
  const totals = summaries.reduce((value, row) => ({ totalTransactions: value.totalTransactions + row.totalTransactions, successfulPayments: value.successfulPayments + row.successfulPayments, failedPayments: value.failedPayments + row.failedPayments }), { totalTransactions: 0, successfulPayments: 0, failedPayments: 0 });
  const single = summaries.length === 1 ? summaries[0] : null; const total = totals.totalTransactions; const successful = totals.successfulPayments;
  res.json({ success: true, data: { environment, livemode: match.livemode, ...totals, grossVolume: single?.grossVolume ?? null, fees: single?.fees ?? null, netMerchantValue: single?.netMerchantValue ?? null, refunds: single?.refunds ?? null, monetaryByCurrency, pendingSettlements, completedSettlements, successRate: total ? Number(((successful / total) * 100).toFixed(2)) : 0, activeMerchants, apiRequests }, meta: { environment, excludesLegacyUnknown: true, mixedCurrencies: summaries.length > 1 } });
});

router.get("/transactions", permission("transaction:view"), async (req, res) => {
  const filter = { ...dates(req.query) };
  for (const key of ["environment", "status", "provider", "merchant"]) if (req.query[key]) filter[key] = req.query[key];
  if (req.query.livemode !== undefined) filter.livemode = req.query.livemode === "true";
  if (req.query.search) { const escaped = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); filter.$or = ["transactionId", "providerPaymentId", "customerEmail", "customerName"].map((field) => ({ [field]: new RegExp(escaped, "i") })); }
  const { page, limit } = pageOptions(req.query); const [items, total] = await Promise.all([Transaction.find(filter).populate("merchant", "businessName contactEmail").populate("user", "email").select("-rawProviderResponse").sort(sortOf(req.query, ["createdAt", "amount", "status", "provider"])).skip((page - 1) * limit).limit(limit), Transaction.countDocuments(filter)]);
  const data = items.map((tx) => ({ id: tx._id, paymentId: tx.transactionId || tx.providerPaymentId || String(tx._id), merchant: tx.merchant, customer: { id: tx.user?._id || null, email: tx.customerEmail || tx.user?.email || null, name: tx.customerName || null }, amount: tx.amount, currency: tx.currency, provider: tx.provider, environment: tx.environment, livemode: tx.livemode, sandboxScenario: tx.sandboxScenario, status: tx.status, fees: tx.merchantFee || tx.estimatedFee || 0, netAmount: tx.merchantNet || tx.estimatedNet || 0, refundStatus: tx.refund?.providerRefundStatus || (tx.status === "refunded" ? "completed" : null), refundAmount: tx.refund?.refundAmount || 0, createdAt: tx.createdAt }));
  res.json({ success: true, data, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

router.get("/settlements", permission("settlement:view"), async (req, res) => {
  const filter = { ...dates(req.query) }; for (const key of ["environment", "status", "merchant"]) if (req.query[key]) filter[key] = req.query[key];
  const { page, limit } = pageOptions(req.query); const [items, total] = await Promise.all([Settlement.find(filter).populate("merchant", "businessName contactEmail").sort(sortOf(req.query, ["createdAt", "amount", "netAmount", "status", "settlementDate"])).skip((page - 1) * limit).limit(limit), Settlement.countDocuments(filter)]);
  res.json({ success: true, data: items.map((s) => ({ id: s._id, merchant: s.merchant, grossAmount: s.amount, fees: Math.max(0, s.amount - s.netAmount), netAmount: s.netAmount, refundAmount: s.refundAmount || 0, outstandingAmount: s.outstandingAmount ?? s.netAmount, currency: s.currency, transactionCount: s.transactionCount, environment: s.environment, livemode: s.livemode, status: s.status, createdAt: s.createdAt, settlementDate: s.settlementDate })), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

router.patch("/settlements/:id/complete", permission("settlement:complete"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "INVALID_ID", "Invalid settlement ID.");
  const settlement = await Settlement.findById(req.params.id);
  if (!settlement) return fail(res, 404, "SETTLEMENT_NOT_FOUND", "Settlement not found.");
  if (settlement.environment !== "sandbox" || settlement.livemode !== false) return fail(res, 403, "SANDBOX_ONLY", "Only sandbox settlements can be completed by this operation.");
  if (settlement.status === "completed") return fail(res, 409, "ALREADY_COMPLETED", "Settlement is already completed.");
  const before = settlement.status; settlement.status = "completed"; settlement.settlementDate = new Date(); settlement.processedAt = settlement.settlementDate; await settlement.save();
  await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "sandbox_settlement_completed", targetType: "settlement", targetId: settlement._id, severity: "high", metadata: { before, after: "completed", simulationOnly: true, completedAt: settlement.settlementDate }, req });
  res.json({ success: true, data: settlement, meta: { simulationOnly: true } });
});

router.get("/fraud-logs", permission("fraud:view"), async (req, res) => {
  const logs = await FraudLog.find().populate("user", "email merchantId").sort({ createdAt: -1 }).limit(200);
  const severity = (score, decision) => decision === "BLOCK" || score >= 80 ? "critical" : decision === "FLAG" || score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  res.json({ success: true, data: logs.map((log) => ({ id: log._id, user: log.user, merchant: log.user?.merchantId || null, riskScore: log.riskScore, decision: log.decision, reasons: log.reasons || [], severity: severity(log.riskScore || 0, log.decision), createdAt: log.createdAt, source: log.source || null })) });
});

router.get("/audit-logs", permission("audit:view"), async (req, res) => { const logs = await AuditLog.find().populate("admin", "email role").sort({ createdAt: -1 }).limit(200); res.json({ success: true, data: logs }); });
module.exports = router;
