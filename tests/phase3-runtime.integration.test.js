const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../app");
const ApiKey = require("../models/ApiKey");
const ApiLog = require("../models/ApiLog");
const AuditLog = require("../models/AuditLog");
const Merchant = require("../models/Merchant");
const MerchantWebhook = require("../models/MerchantWebhook");
const User = require("../models/User");
const WebhookDelivery = require("../models/WebhookDelivery");
const { createSandboxApiKey, createVerifiedMerchantAccount } = require("./helpers/merchantFixtures");
const { assertSafeDestructiveOperation, connectTestDatabase, disconnectTestDatabase, runId } = require("./helpers/testDatabase");
const { installExternalNetworkTripwire } = require("./helpers/networkIsolation");

const ids = { merchants: [], users: [], apiKeys: [], webhooks: [], deliveries: [] };
let server, baseUrl, admin, adminToken, accountA, accountB, keyA;

async function request(method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}

async function login(account, password = "MerchantTest123!") {
  return request("POST", "/auth/login", { email: account.owner.email, password });
}

test.before(async () => {
  installExternalNetworkTripwire();
  await connectTestDatabase();
  accountA = await createVerifiedMerchantAccount();
  accountB = await createVerifiedMerchantAccount();
  ids.merchants.push(accountA.merchant._id, accountB.merchant._id);
  ids.users.push(accountA.owner._id, accountB.owner._id);
  admin = await User.create({ email: `runtime-admin-${runId}@aurapay.test`, password: await bcrypt.hash("AdminRuntime123!", 4), role: "super_admin", status: "verified", emailVerified: true });
  ids.users.push(admin._id);
  adminToken = jwt.sign({ id: admin._id, adminSecurityVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "10m" });
  keyA = await createSandboxApiKey(accountA.merchant, { permissions: ["account:read"] });
  ids.apiKeys.push(keyA.apiKey._id);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  assertSafeDestructiveOperation();
  await ApiLog.deleteMany({ merchant: { $in: ids.merchants } });
  await AuditLog.deleteMany({ $or: [{ admin: { $in: ids.users } }, { targetId: { $in: [...ids.users, ...ids.merchants].map(String) } }] });
  await WebhookDelivery.deleteMany({ _id: { $in: ids.deliveries } });
  await MerchantWebhook.deleteMany({ _id: { $in: ids.webhooks } });
  await ApiKey.deleteMany({ _id: { $in: ids.apiKeys } });
  await User.deleteMany({ _id: { $in: ids.users } });
  await Merchant.deleteMany({ _id: { $in: ids.merchants } });
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await disconnectTestDatabase();
});

test("merchant disable, freeze, and password reset revoke existing sessions", async () => {
  const initial = await login(accountA);
  assert.equal(initial.status, 200);
  const firstToken = initial.body.token;
  const firstRefresh = initial.body.refreshToken;
  assert.equal((await request("GET", "/merchant/developer/webhooks", null, firstToken)).status, 200);

  assert.equal((await request("PATCH", `/merchants/${accountA.merchant._id}/disable`, { reason: "runtime test" }, adminToken)).status, 200);
  assert.equal((await request("GET", "/merchant/developer/webhooks", null, firstToken)).status, 401);
  assert.equal((await request("PATCH", `/merchants/${accountA.merchant._id}/enable`, {}, adminToken)).status, 200);
  assert.equal((await request("GET", "/merchant/developer/webhooks", null, firstToken)).status, 401);

  const second = await login(accountA);
  assert.equal(second.status, 200);
  assert.equal((await request("GET", "/merchant/developer/webhooks", null, second.body.token)).status, 200);
  assert.equal((await request("POST", `/admin/users/${accountA.owner._id}/freeze`, { reason: "runtime test" }, adminToken)).status, 200);
  assert.equal((await request("GET", "/merchant/developer/webhooks", null, second.body.token)).status, 401);
  assert.equal((await request("POST", `/admin/users/${accountA.owner._id}/unfreeze`, {}, adminToken)).status, 200);
  assert.equal((await request("GET", "/merchant/developer/webhooks", null, second.body.token)).status, 401);

  const third = await login(accountA);
  assert.equal(third.status, 200);
  const resetToken = `reset-${runId}`;
  await User.updateOne({ _id: accountA.owner._id }, { passwordResetToken: crypto.createHash("sha256").update(resetToken).digest("hex"), passwordResetExpires: new Date(Date.now() + 60000) });
  assert.equal((await request("POST", `/auth/reset-password/${resetToken}`, { password: "NewMerchant123!" })).status, 200);
  assert.equal((await request("GET", "/merchant/developer/webhooks", null, third.body.token)).status, 401);
  assert.equal((await request("POST", "/auth/refresh-token", { refreshToken: third.body.refreshToken })).status, 401);
  assert.equal((await request("POST", "/auth/refresh-token", { refreshToken: firstRefresh })).status, 401);
  assert.equal((await login(accountA, "NewMerchant123!")).status, 200);
  const refreshed = await User.findById(accountA.owner._id).select("+merchantSecurityVersion");
  assert.equal(refreshed.merchantSecurityVersion, 5);
});

test("API keys enforce current merchant and owner account state without version coupling", async () => {
  const call = () => request("GET", "/api/v1/account", null, keyA.secretKey);
  assert.equal((await call()).status, 200);
  await Merchant.updateOne({ _id: accountA.merchant._id }, { active: false });
  assert.equal((await call()).status, 401);
  await Merchant.updateOne({ _id: accountA.merchant._id }, { active: true });
  assert.equal((await call()).status, 200);
  await User.updateOne({ _id: accountA.owner._id }, { frozen: true });
  assert.equal((await call()).status, 401);
  await User.updateOne({ _id: accountA.owner._id }, { frozen: false });
  assert.equal((await call()).status, 200);
});

test("authenticated Merchant A cannot access Merchant B webhook resources", async () => {
  const tokenA = (await login(accountA, "NewMerchant123!")).body.token;
  const webhook = await MerchantWebhook.create({ merchant: accountB.merchant._id, url: "https://merchant.example/webhook", secret: "whsec_runtime_test", eventTypes: ["payment.completed"], active: true });
  ids.webhooks.push(webhook._id);
  const delivery = await WebhookDelivery.create({ merchant: accountB.merchant._id, webhook: webhook._id, eventType: "payment.completed", status: "failed", payloadPreview: { id: "evt_runtime" } });
  ids.deliveries.push(delivery._id);
  assert.equal((await request("PUT", `/merchant/developer/webhooks/${webhook._id}`, { active: false }, tokenA)).status, 404);
  assert.equal((await request("DELETE", `/merchant/developer/webhooks/${webhook._id}`, null, tokenA)).status, 404);
  assert.equal((await request("POST", `/merchant/developer/webhooks/${webhook._id}/test`, {}, tokenA)).status, 404);
  assert.equal((await request("GET", `/merchant/developer/webhooks/${webhook._id}/deliveries`, null, tokenA)).status, 404);
  assert.equal((await request("POST", `/merchant/developer/webhook-deliveries/${delivery._id}/retry`, {}, tokenA)).status, 404);
});
