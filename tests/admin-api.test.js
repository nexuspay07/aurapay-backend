const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
process.env.ADMIN_LOGIN_LIMIT = "3";
process.env.ADMIN_EMAIL_DELIVERY_DISABLED = "true";
const app = require("../app");
const User = require("../models/User");
const Merchant = require("../models/Merchant");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const AuditLog = require("../models/AuditLog");
const AdminInvitation = require("../models/AdminInvitation");
const crypto = require("crypto");

const runId = `admin-v2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ids = { users: [], merchants: [], transactions: [], settlements: [], invitations: [] };
let server, baseUrl, superAdmin, merchantUser, merchant, adminToken, merchantToken;
const request = async (method, path, body, token) => {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
};

test.before(async () => {
  await mongoose.connect(process.env.MONGO_URI_TEST || process.env.MONGO_URI);
  merchant = await Merchant.create({ businessName: runId, legalName: `${runId} LLC`, businessType: "corporation", contactEmail: `${runId}@test.invalid`, country: "CA", active: true }); ids.merchants.push(merchant._id);
  superAdmin = await User.create({ email: `${runId}-admin@test.invalid`, password: await bcrypt.hash("AdminPass123!", 4), role: "super_admin", permissions: [], status: "verified" }); ids.users.push(superAdmin._id);
  merchantUser = await User.create({ email: `${runId}-merchant@test.invalid`, password: await bcrypt.hash("MerchantPass123!", 4), role: "merchant_owner", merchantId: merchant._id, status: "verified" }); ids.users.push(merchantUser._id);
  adminToken = jwt.sign({ id: superAdmin._id }, process.env.JWT_SECRET, { expiresIn: "5m" }); merchantToken = jwt.sign({ id: merchantUser._id }, process.env.JWT_SECRET, { expiresIn: "5m" });
  server = http.createServer(app); await new Promise((resolve) => server.listen(0, resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await AuditLog.deleteMany({ $or: [{ admin: { $in: ids.users } }, { targetId: { $in: [...ids.users, ...ids.merchants, ...ids.settlements].map(String) } }] });
  await AdminInvitation.deleteMany({ _id: { $in: ids.invitations } });
  await Settlement.deleteMany({ _id: { $in: ids.settlements } }); await Transaction.deleteMany({ _id: { $in: ids.transactions } }); await User.deleteMany({ _id: { $in: ids.users } }); await Merchant.deleteMany({ _id: { $in: ids.merchants } });
  if (server?.listening) await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect();
});

test("public merchant list/detail and legacy applications are rejected", async () => {
  assert.equal((await request("GET", "/merchants")).status, 401);
  assert.equal((await request("GET", `/merchants/${merchant._id}`)).status, 401);
  assert.equal((await request("GET", `/applications/${merchant._id}`)).status, 401);
  assert.equal((await request("POST", "/applications", { merchant: merchant._id, name: "x" })).status, 401);
});

test("admin routes reject missing, merchant, and forged tokens", async () => {
  assert.equal((await request("GET", "/admin/metrics")).status, 401);
  assert.equal((await request("GET", "/admin/metrics", null, merchantToken)).status, 403);
  assert.equal((await request("GET", "/admin/metrics", null, `${adminToken}forged`)).status, 401);
});

test("admin login is safe, validates bodies, and rate limits failures", async () => {
  assert.equal((await request("POST", "/admin-auth/login", {})).status, 400);
  const good = await request("POST", "/admin-auth/login", { email: superAdmin.email, password: "AdminPass123!" }); assert.equal(good.status, 200); assert.ok(good.body.data.token);
  const email = `${runId}-missing@test.invalid`;
  assert.equal((await request("POST", "/admin-auth/login", { email, password: "wrong" })).status, 401);
  await request("POST", "/admin-auth/login", { email, password: "wrong" }); await request("POST", "/admin-auth/login", { email, password: "wrong" });
  assert.equal((await request("POST", "/admin-auth/login", { email, password: "wrong" })).status, 429);
});

test("sandbox metrics exclude legacy unknown records and expose canonical values", async () => {
  const txs = await Transaction.create([{ merchant: merchant._id, amount: 125, currency: "usd", provider: "Test", environment: "sandbox", livemode: false, status: "completed", merchantFee: 5, merchantNet: 120 }, { merchant: merchant._id, amount: 75, currency: "usd", provider: "Test", environment: "sandbox", livemode: false, status: "failed" }]); ids.transactions.push(...txs.map((x) => x._id));
  const legacy = await Transaction.collection.insertOne({ merchant: merchant._id, amount: 7000, currency: "usd", provider: "Stripe", status: "completed", createdAt: new Date(), updatedAt: new Date() }); ids.transactions.push(legacy.insertedId);
  const result = await request("GET", "/admin/metrics?environment=sandbox", null, adminToken); assert.equal(result.status, 200); assert.equal(result.body.data.totalTransactions, 2); assert.equal(result.body.data.grossVolume, 125); assert.equal(result.body.data.fees, 5); assert.equal(result.body.data.netMerchantValue, 120);
});

test("canonical transaction query and sandbox settlement completion work with audit", async () => {
  const listed = await request("GET", `/admin/transactions?environment=sandbox&merchant=${merchant._id}`, null, adminToken); assert.equal(listed.status, 200); assert.ok(listed.body.data.some((tx) => tx.amount === 125)); assert.ok(listed.body.data.some((tx) => tx.status === "failed"));
  const settlement = await Settlement.create({ merchant: merchant._id, transaction: ids.transactions[0], amount: 125, netAmount: 120, currency: "usd", environment: "sandbox", livemode: false }); ids.settlements.push(settlement._id);
  const completed = await request("PATCH", `/admin/settlements/${settlement._id}/complete`, {}, adminToken); assert.equal(completed.status, 200); assert.equal(completed.body.meta.simulationOnly, true);
  assert.ok(await AuditLog.exists({ action: "sandbox_settlement_completed", targetId: String(settlement._id), admin: superAdmin._id }));
});

test("admin invitations are hashed, scoped, expiring, revocable, and single-use", async () => {
  const email = `${runId}-invite@test.invalid`; const created = await request("POST", "/admin-auth/invitations", { email, role: "support_admin" }, adminToken); assert.equal(created.status, 201); const invitationId = created.body.data.invitation.id; ids.invitations.push(invitationId); const rawToken = created.body.data.developmentInviteLink.split("/").pop();
  const stored = await AdminInvitation.findById(invitationId).select("+tokenHash"); assert.notEqual(stored.tokenHash, rawToken); assert.equal(stored.tokenHash, crypto.createHash("sha256").update(rawToken).digest("hex"));
  const listed = await request("GET", "/admin-auth/invitations", null, adminToken); assert.equal(listed.status, 200); assert.equal(JSON.stringify(listed.body).includes("tokenHash"), false); assert.equal(JSON.stringify(listed.body).includes(rawToken), false);
  assert.equal((await request("POST", `/admin-auth/invitations/${rawToken}/accept`, { password: "weakpassword" })).status, 400);
  assert.equal((await request("POST", "/admin-auth/invitations", { email, role: "support_admin" }, adminToken)).status, 409);
  assert.equal((await request("POST", `/admin-auth/invitations/${rawToken}/accept`, { password: "StrongInvite123" })).status, 201); const accepted = await User.findOne({ email }); ids.users.push(accepted._id);
  accepted.permissions = ["admin:create"]; await accepted.save(); const lowerToken = jwt.sign({ id: accepted._id }, process.env.JWT_SECRET, { expiresIn: "5m" }); assert.equal((await request("POST", "/admin-auth/invitations", { email: `${runId}-forbidden-super@test.invalid`, role: "super_admin" }, lowerToken)).status, 403);
  assert.equal((await request("POST", `/admin-auth/invitations/${rawToken}/accept`, { password: "StrongInvite123" })).status, 400);
  assert.ok(await AuditLog.exists({ action: "admin.invitation.created", targetId: String(invitationId) })); assert.ok(await AuditLog.exists({ action: "admin.invitation.accepted", targetId: String(accepted._id) }));

  const revokedEmail = `${runId}-revoked@test.invalid`; const pending = await request("POST", "/admin-auth/invitations", { email: revokedEmail, role: "auditor" }, adminToken); ids.invitations.push(pending.body.data.invitation.id); const revokedToken = pending.body.data.developmentInviteLink.split("/").pop(); assert.equal((await request("PATCH", `/admin-auth/invitations/${pending.body.data.invitation.id}/revoke`, {}, adminToken)).status, 200); assert.equal((await request("POST", `/admin-auth/invitations/${revokedToken}/accept`, { password: "StrongInvite123" })).status, 400);
  const expired = await AdminInvitation.create({ email: `${runId}-expired@test.invalid`, role: "auditor", permissions: [], tokenHash: crypto.createHash("sha256").update("expired-token").digest("hex"), expiresAt: new Date(Date.now() - 1000), invitedBy: superAdmin._id }); ids.invitations.push(expired._id); assert.equal((await request("POST", "/admin-auth/invitations/expired-token/accept", { password: "StrongInvite123" })).status, 400);
});

test("security-sensitive admin changes revoke old JWTs and preserve admin boundaries", async () => {
  async function makeAdmin(suffix, role = "support_admin", permissions = []) { const user = await User.create({ email: `${runId}-${suffix}@test.invalid`, password: await bcrypt.hash("AdminPass123!", 4), role, permissions, status: "verified" }); ids.users.push(user._id); return user; }
  const disabled = await makeAdmin("disabled"); const disabledToken = jwt.sign({ id: disabled._id, adminSecurityVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  assert.equal((await request("PATCH", `/admin-auth/admins/${disabled._id}/status`, { status: "disabled" }, adminToken)).status, 200); assert.equal((await request("GET", "/admin-auth/me", null, disabledToken)).status, 401);
  const frozen = await makeAdmin("frozen"); const frozenToken = jwt.sign({ id: frozen._id, adminSecurityVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  assert.equal((await request("POST", `/admin/users/${frozen._id}/freeze`, { reason: "security test" }, adminToken)).status, 200); assert.equal((await request("GET", "/admin-auth/me", null, frozenToken)).status, 401);
  const changed = await makeAdmin("changed", "support_admin", ["admin:view"]); const changedToken = jwt.sign({ id: changed._id, adminSecurityVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  assert.equal((await request("PATCH", `/admin-auth/admins/${changed._id}`, { role: "auditor", permissions: [] }, adminToken)).status, 200); assert.equal((await request("GET", "/admin-auth/me", null, changedToken)).status, 401);
  const permissions = await makeAdmin("permissions", "support_admin", []); const permissionsToken = jwt.sign({ id: permissions._id, adminSecurityVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  assert.equal((await request("PATCH", `/admin-auth/admins/${permissions._id}`, { permissions: ["admin:view"] }, adminToken)).status, 200); assert.equal((await request("GET", "/admin-auth/me", null, permissionsToken)).status, 401);
  assert.equal((await request("PATCH", `/admin-auth/admins/${superAdmin._id}/status`, { status: "disabled" }, adminToken)).status, 409);
  assert.ok(await AuditLog.exists({ action: "admin.session.invalidated", targetId: String(changed._id) }));
});

test("admin password reset is generic, hashed, expiring, and single-use", async () => {
  const generic = await request("POST", "/admin-auth/forgot-password", { email: `${runId}-none@test.invalid` }); assert.equal(generic.status, 200); assert.match(generic.body.data.message, /eligible account/i);
  const token = "admin-reset-test-token"; superAdmin.passwordResetToken = crypto.createHash("sha256").update(token).digest("hex"); superAdmin.passwordResetExpires = new Date(Date.now() + 60000); await superAdmin.save();
  assert.equal((await request("POST", `/admin-auth/reset-password/${token}`, { password: "NewAdminPass123" })).status, 200); assert.equal((await request("GET", "/admin-auth/me", null, adminToken)).status, 401); assert.equal((await request("POST", `/admin-auth/reset-password/${token}`, { password: "NewAdminPass123" })).status, 400); assert.ok(await AuditLog.exists({ action: "admin.password.reset.completed", admin: superAdmin._id }));
});
