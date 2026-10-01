const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { connectTestDatabase, disconnectTestDatabase, assertSafeDestructiveOperation } = require("./helpers/testDatabase");
const app = require("../app");
const User = require("../models/User");
const Merchant = require("../models/Merchant");
const AuditLog = require("../models/AuditLog");

const password = "PrivateTester123!";
const ids = { users: [], merchants: [] };
let server, baseUrl, adminToken, merchantToken, owner, merchant, tokenHash;
const request = async (method, path, body, token) => {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
};
async function makeMerchant(suffix, overrides = {}) {
  const value = await Merchant.create({ businessName: `Private ${suffix}`, legalName: `Private ${suffix} Inc`, businessType: "corporation", contactEmail: `private-${suffix}-${Date.now()}@aurapay.test`, ownerEmail: `owner-${suffix}-${Date.now()}@aurapay.test`, country: "CA", verificationStatus: "under_review", active: true, ...overrides });
  ids.merchants.push(value._id); return value;
}
async function makeOwner(value, suffix, overrides = {}) {
  const raw = `verification-${suffix}`; const user = await User.create({ email: value.ownerEmail, password: await bcrypt.hash(password, 4), role: "merchant_owner", merchantId: value._id, status: "unverified", emailVerified: false, emailVerificationToken: crypto.createHash("sha256").update(raw).digest("hex"), emailVerificationExpires: new Date(Date.now() + 60000), ...overrides });
  ids.users.push(user._id); return user;
}

test.before(async () => {
  await connectTestDatabase();
  merchant = await makeMerchant("primary"); owner = await makeOwner(merchant, "primary"); tokenHash = (await User.findById(owner._id).select("+emailVerificationToken")).emailVerificationToken;
  const admin = await User.create({ email: `private-admin-${Date.now()}@aurapay.test`, password: await bcrypt.hash(password, 4), role: "risk_admin", status: "verified", emailVerified: true }); ids.users.push(admin._id);
  const merchantActor = await makeOwner(await makeMerchant("actor"), "actor", { status: "verified", emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null });
  adminToken = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: "5m" }); merchantToken = jwt.sign({ id: merchantActor._id, merchantSecurityVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  server = http.createServer(app); await new Promise((resolve) => server.listen(0, resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  assertSafeDestructiveOperation(); await AuditLog.deleteMany({ $or: [{ admin: { $in: ids.users } }, { targetId: { $in: ids.users.map(String) } }] }); await User.deleteMany({ _id: { $in: ids.users } }); await Merchant.deleteMany({ _id: { $in: ids.merchants } });
  if (server?.listening) await new Promise((resolve) => server.close(resolve)); await disconnectTestDatabase();
});

test("manual verification endpoint enforces authentication, admin role, and merchant:verify", async () => {
  assert.equal((await request("PATCH", `/admin/users/${owner._id}/verify-email`, {})).status, 401);
  assert.equal((await request("PATCH", `/admin/users/${owner._id}/verify-email`, {}, merchantToken)).status, 403);
  const support = await User.create({ email: `private-support-${Date.now()}@aurapay.test`, password: await bcrypt.hash(password, 4), role: "support_admin", status: "verified", emailVerified: true }); ids.users.push(support._id);
  const supportToken = jwt.sign({ id: support._id }, process.env.JWT_SECRET, { expiresIn: "5m" });
  assert.equal((await request("PATCH", `/admin/users/${owner._id}/verify-email`, {}, supportToken)).status, 403);
});

test("authorized admin verifies only the selected owner email and creates a safe audit event", async () => {
  const unrelatedMerchant = await makeMerchant("unrelated", { verificationStatus: "rejected", active: false }); const unrelated = await makeOwner(unrelatedMerchant, "unrelated");
  const beforeOwner = await User.findById(owner._id).select("+password +emailVerificationToken +merchantSecurityVersion +refreshToken").lean(); const beforeMerchant = merchant.toObject();
  assert.equal((await request("POST", "/auth/login", { email: owner.email, password })).body.error.code, "EMAIL_NOT_VERIFIED");
  const response = await request("PATCH", `/admin/users/${owner._id}/verify-email`, {}, adminToken); assert.equal(response.status, 200);
  const after = await User.findById(owner._id).select("+password +emailVerificationToken +merchantSecurityVersion +refreshToken").lean();
  assert.equal(after.emailVerified, true); assert.equal(after.status, "verified"); assert.equal(after.emailVerificationToken, null); assert.equal(after.emailVerificationExpires, null);
  for (const field of ["password", "role", "merchantId", "frozen", "lockedUntil", "merchantSecurityVersion", "refreshToken"]) assert.deepEqual(after[field], beforeOwner[field], field);
  const merchantAfter = await Merchant.findById(merchant._id).lean(); assert.equal(merchantAfter.verificationStatus, beforeMerchant.verificationStatus); assert.equal(merchantAfter.active, beforeMerchant.active);
  const unrelatedAfter = await User.findById(unrelated._id).select("+emailVerificationToken"); assert.equal(unrelatedAfter.emailVerified, false); assert.ok(unrelatedAfter.emailVerificationToken);
  const unrelatedMerchantAfter = await Merchant.findById(unrelatedMerchant._id); assert.equal(unrelatedMerchantAfter.verificationStatus, "rejected"); assert.equal(unrelatedMerchantAfter.active, false);
  const audit = await AuditLog.findOne({ action: "merchant_owner.email.manually_verified", targetId: String(owner._id) }).lean(); assert.ok(audit); assert.equal(audit.metadata.associatedMerchant, String(merchant._id)); assert.equal(JSON.stringify(audit).includes(tokenHash), false); assert.doesNotMatch(JSON.stringify(audit), /verificationToken|tokenHash/i);
  assert.equal((await request("POST", "/auth/login", { email: owner.email, password })).status, 200);
  assert.equal((await request("POST", "/auth/login", { email: owner.email, password: "WrongPassword123!" })).status, 401);
  assert.equal((await request("PATCH", `/admin/users/${owner._id}/verify-email`, {}, adminToken)).status, 409);
});

test("invalid, missing, unsupported, and malformed targets are rejected", async () => {
  assert.equal((await request("PATCH", "/admin/users/not-an-id/verify-email", {}, adminToken)).status, 400);
  assert.equal((await request("PATCH", `/admin/users/${new mongoose.Types.ObjectId()}/verify-email`, {}, adminToken)).status, 404);
  const ordinary = await User.create({ email: `ordinary-${Date.now()}@aurapay.test`, password: await bcrypt.hash(password, 4), role: "user", status: "unverified" }); ids.users.push(ordinary._id);
  assert.equal((await request("PATCH", `/admin/users/${ordinary._id}/verify-email`, {}, adminToken)).status, 422);
  const malformed = await User.create({ email: `malformed-${Date.now()}@aurapay.test`, password: await bcrypt.hash(password, 4), role: "merchant_owner", merchantId: new mongoose.Types.ObjectId(), status: "unverified", emailVerified: false }); ids.users.push(malformed._id);
  assert.equal((await request("PATCH", `/admin/users/${malformed._id}/verify-email`, {}, adminToken)).status, 422);
});

test("manual email verification preserves frozen and disabled-merchant login restrictions", async () => {
  const frozenMerchant = await makeMerchant("frozen"); const frozen = await makeOwner(frozenMerchant, "frozen", { frozen: true });
  assert.equal((await request("PATCH", `/admin/users/${frozen._id}/verify-email`, {}, adminToken)).status, 200); assert.equal((await request("POST", "/auth/login", { email: frozen.email, password })).status, 401); assert.equal((await User.findById(frozen._id)).frozen, true);
  const disabledMerchant = await makeMerchant("disabled", { active: false }); const disabled = await makeOwner(disabledMerchant, "disabled");
  assert.equal((await request("PATCH", `/admin/users/${disabled._id}/verify-email`, {}, adminToken)).status, 200); assert.equal((await request("POST", "/auth/login", { email: disabled.email, password })).status, 401); assert.equal((await Merchant.findById(disabledMerchant._id)).active, false);
});
