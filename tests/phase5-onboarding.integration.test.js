const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const test = require("node:test");
process.env.EMAIL_DELIVERY_DISABLED = "true";
const app = require("../app");
const Merchant = require("../models/Merchant");
const User = require("../models/User");
const { registerMerchant, resendVerification, tokenHash } = require("../services/merchantOnboardingService");
const { resetPublicAuthRateLimits } = require("../middlewares/publicAuthRateLimit");
const { assertSafeDestructiveOperation, connectTestDatabase, disconnectTestDatabase, runId } = require("./helpers/testDatabase");
const { installExternalNetworkTripwire } = require("./helpers/networkIsolation");

const ids = { merchants: [], users: [] };
const base = `${runId}-${Date.now()}`.toLowerCase();
let server, baseUrl;
const payload = (suffix = "one") => ({ businessName: `Phase Five ${suffix}`, legalName: `Phase Five ${suffix} Inc`, businessType: "corporation", contactEmail: `${base}-${suffix}-business@aurapay.test`, ownerEmail: `${base}-${suffix}@aurapay.test`, country: "Canada", password: "PhaseFive123!" });
async function request(method, path, body) { const response = await fetch(`${baseUrl}${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, body: await response.json() }; }
function track(result) { if (result.merchant) ids.merchants.push(result.merchant._id); if (result.owner) ids.users.push(result.owner._id); return result; }

test.before(async () => { installExternalNetworkTripwire(); await connectTestDatabase(); server = http.createServer(app); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { assertSafeDestructiveOperation(); await User.deleteMany({ _id: { $in: ids.users } }); await Merchant.deleteMany({ _id: { $in: ids.merchants } }); if (server?.listening) await new Promise((resolve) => server.close(resolve)); await disconnectTestDatabase(); });
test.beforeEach(() => resetPublicAuthRateLimits());

test("registration atomically creates only a normalized merchant owner with a hashed verification token", async () => {
  const input = payload("atomic"); input.ownerEmail = `  ${input.ownerEmail.toUpperCase()}  `; input.contactEmail = ` ${input.contactEmail.toUpperCase()} `;
  const result = track(await registerMerchant(input, { sendVerificationEmail: async () => ({ id: "mock" }) }));
  assert.equal(result.status, 201); assert.equal(result.owner.role, "merchant_owner"); assert.deepEqual(result.owner.permissions, []); assert.equal(result.owner.email, input.ownerEmail.trim().toLowerCase());
  const stored = await User.findById(result.owner._id).select("+emailVerificationToken"); assert.equal(stored.emailVerificationToken, tokenHash(result.rawToken)); assert.notEqual(stored.emailVerificationToken, result.rawToken);
});

test("email delivery failure leaves one recoverable account and resend rotates the token", async () => {
  const result = track(await registerMerchant(payload("email-fail"), { sendVerificationEmail: async () => { throw new Error("mock provider outage"); } }));
  assert.equal(result.status, 201); assert.equal(result.body.data.emailDelivery, "pending"); assert.match(result.body.message, /account was created/i);
  const oldHash = (await User.findById(result.owner._id).select("+emailVerificationToken")).emailVerificationToken;
  const resent = await resendVerification(result.owner.email, { sendVerificationEmail: async () => ({ id: "mock" }) });
  assert.equal(resent.status, 200); const updated = await User.findById(result.owner._id).select("+emailVerificationToken"); assert.notEqual(updated.emailVerificationToken, oldHash);
  assert.equal(await Merchant.countDocuments({ contactEmail: result.merchant.contactEmail }), 1); assert.equal(await User.countDocuments({ email: result.owner.email }), 1);
});

test("owner failure rolls back merchant creation and sends no email", async () => {
  const input = payload("rollback"); let sends = 0;
  await assert.rejects(registerMerchant(input, { beforeOwnerCreate: async () => { throw new Error("simulated owner failure"); }, sendVerificationEmail: async () => { sends += 1; } }), /simulated owner failure/);
  assert.equal(await Merchant.countDocuments({ contactEmail: input.contactEmail }), 0); assert.equal(await User.countDocuments({ email: input.ownerEmail }), 0); assert.equal(sends, 0);
});

test("case-insensitive duplicate registration creates no duplicate", async () => {
  const first = track(await registerMerchant(payload("duplicate"), { sendVerificationEmail: async () => ({ id: "mock" }) }));
  const secondInput = payload("duplicate"); secondInput.ownerEmail = ` ${secondInput.ownerEmail.toUpperCase()} `;
  const second = await registerMerchant(secondInput, { sendVerificationEmail: async () => ({ id: "mock" }) });
  assert.equal(first.status, 201); assert.equal(second.status, 409); assert.equal(await User.countDocuments({ email: first.owner.email }), 1);
});

test("verification tokens are single-use and expired or random tokens fail", async () => {
  const valid = track(await registerMerchant(payload("verify"), { sendVerificationEmail: async () => ({ id: "mock" }) }));
  assert.equal((await request("GET", `/auth/verify-email/${valid.rawToken}`)).status, 200); assert.equal((await request("GET", `/auth/verify-email/${valid.rawToken}`)).status, 400); assert.equal((await request("GET", "/auth/verify-email/random-token")).status, 400);
  const expired = track(await registerMerchant(payload("expired"), { sendVerificationEmail: async () => ({ id: "mock" }) })); await User.updateOne({ _id: expired.owner._id }, { emailVerificationExpires: new Date(Date.now() - 1000) }); assert.equal((await request("GET", `/auth/verify-email/${expired.rawToken}`)).status, 400);
});

test("merchant password reset tokens are expiring and single-use and replace the old password", async () => {
  const account = track(await registerMerchant(payload("password-reset"), { sendVerificationEmail: async () => ({ id: "mock" }) }));
  await User.updateOne({ _id: account.owner._id }, { status: "verified", emailVerified: true });
  const validToken = `valid-${base}`;
  await User.updateOne({ _id: account.owner._id }, { passwordResetToken: tokenHash(validToken), passwordResetExpires: new Date(Date.now() + 60000) });
  assert.equal((await request("POST", `/auth/reset-password/${validToken}`, { password: "NewPhaseFive123!" })).status, 200);
  assert.equal((await request("POST", `/auth/reset-password/${validToken}`, { password: "AnotherPhaseFive123!" })).status, 400);
  assert.equal((await request("POST", "/auth/login", { email: account.owner.email, password: "PhaseFive123!" })).status, 401);
  assert.equal((await request("POST", "/auth/login", { email: account.owner.email, password: "NewPhaseFive123!" })).status, 200);
  const expiredToken = `expired-${base}`;
  await User.updateOne({ _id: account.owner._id }, { passwordResetToken: crypto.createHash("sha256").update(expiredToken).digest("hex"), passwordResetExpires: new Date(Date.now() - 1000) });
  assert.equal((await request("POST", `/auth/reset-password/${expiredToken}`, { password: "AnotherPhaseFive123!" })).status, 400);
  assert.equal((await request("POST", "/auth/reset-password/random-reset-token", { password: "AnotherPhaseFive123!" })).status, 400);
});

test("resend and forgot-password resist enumeration and enforce rate limits", async () => {
  const existing = track(await registerMerchant(payload("enumeration"), { sendVerificationEmail: async () => ({ id: "mock" }) }));
  const a = await request("POST", "/auth/resend-verification", { email: existing.owner.email }); const b = await request("POST", "/auth/resend-verification", { email: `${base}-missing@aurapay.test` }); assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(a.body.message, b.body.message);
  const f1 = await request("POST", "/auth/forgot-password", { email: existing.owner.email }); const f2 = await request("POST", "/auth/forgot-password", { email: `${base}-missing2@aurapay.test` }); assert.equal(f1.status, 200); assert.equal(f2.status, 200); assert.equal(f1.body.message, f2.body.message);
  resetPublicAuthRateLimits(); for (let i = 0; i < 5; i += 1) assert.equal((await request("POST", "/auth/forgot-password", { email: "rate@aurapay.test" })).status, 200); assert.equal((await request("POST", "/auth/forgot-password", { email: "rate@aurapay.test" })).status, 429);
  resetPublicAuthRateLimits(); for (let i = 0; i < 5; i += 1) assert.equal((await request("POST", "/auth/resend-verification", { email: "resend-rate@aurapay.test" })).status, 200); assert.equal((await request("POST", "/auth/resend-verification", { email: "resend-rate@aurapay.test" })).status, 429);
  resetPublicAuthRateLimits(); const invalidRegistration = { ...payload("rate-registration"), businessName: "" }; for (let i = 0; i < 5; i += 1) assert.equal((await request("POST", "/merchants/register", invalidRegistration)).status, 400); assert.equal((await request("POST", "/merchants/register", invalidRegistration)).status, 429);
});

test("legacy auth registration cannot assign privileged roles", async () => { const response = await request("POST", "/auth/register", { email: `${base}-admin@aurapay.test`, password: "PhaseFive123!", role: "super_admin", permissions: ["admin:create"] }); assert.equal(response.status, 410); assert.equal(await User.countDocuments({ email: `${base}-admin@aurapay.test` }), 0); });
