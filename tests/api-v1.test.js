const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("http");
const mongoose = require("mongoose");

process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || "1000";
process.env.API_RATE_LIMIT_WINDOW_MS =
  process.env.API_RATE_LIMIT_WINDOW_MS || "60000";

const app = require("../app");
const ApiKey = require("../models/ApiKey");
const ApiLog = require("../models/ApiLog");
const IdempotencyKey = require("../models/IdempotencyKey");
const Merchant = require("../models/Merchant");
const MerchantWebhook = require("../models/MerchantWebhook");
const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const WebhookDelivery = require("../models/WebhookDelivery");
const apiKeyService = require("../services/apiKeyService");

let server;
let baseUrl;
let merchant;
let otherMerchant;
let fullKey;
let fullSecret;
let readOnlySecret;
let revokedSecret;
let expiredSecret;
let otherSecret;
const createdIds = {
  apiKeys: [],
  merchants: [],
  users: [],
  transactions: [],
  webhooks: [],
};

test.before(async () => {
  const mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;
  assert.ok(mongoUri, "MONGO_URI_TEST or MONGO_URI is required for API tests");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  merchant = await Merchant.create({
    businessName: "API Test Merchant",
    legalName: "API Test Merchant LLC",
    businessType: "corporation",
    contactEmail: `api-${Date.now()}@aurapay.test`,
    country: "US",
    active: true,
    verificationStatus: "verified",
  });
  otherMerchant = await Merchant.create({
    businessName: "Other API Merchant",
    legalName: "Other API Merchant LLC",
    businessType: "corporation",
    contactEmail: `other-api-${Date.now()}@aurapay.test`,
    country: "US",
    active: true,
    verificationStatus: "verified",
  });
  createdIds.merchants.push(merchant._id, otherMerchant._id);

  const user = await User.create({
    email: `owner-${Date.now()}@aurapay.test`,
    password: "hashed-test-password",
    role: "merchant_owner",
    merchantId: merchant._id,
  });
  createdIds.users.push(user._id);

  const full = await apiKeyService.createApiKey({
    merchant: merchant._id,
    name: "Full test key",
    environment: "sandbox",
    permissions: [
      "payments:create",
      "payments:read",
      "refunds:create",
      "refunds:read",
      "checkouts:create",
      "checkouts:read",
      "transactions:read",
      "settlements:read",
      "account:read",
    ],
  });
  fullKey = full.apiKey;
  fullSecret = full.secretKey;
  createdIds.apiKeys.push(full.apiKey._id);

  const readOnly = await apiKeyService.createApiKey({
    merchant: merchant._id,
    name: "Read-only test key",
    environment: "sandbox",
    permissions: ["payments:read"],
  });
  readOnlySecret = readOnly.secretKey;
  createdIds.apiKeys.push(readOnly.apiKey._id);

  const revoked = await apiKeyService.createApiKey({
    merchant: merchant._id,
    name: "Revoked test key",
    environment: "sandbox",
    permissions: ["payments:read"],
  });
  revokedSecret = revoked.secretKey;
  await ApiKey.findByIdAndUpdate(revoked.apiKey._id, { active: false });
  createdIds.apiKeys.push(revoked.apiKey._id);

  const expired = await apiKeyService.createApiKey({
    merchant: merchant._id,
    name: "Expired test key",
    environment: "sandbox",
    permissions: ["payments:read"],
    expiresAt: new Date(Date.now() - 1000),
  });
  expiredSecret = expired.secretKey;
  createdIds.apiKeys.push(expired.apiKey._id);

  const other = await apiKeyService.createApiKey({
    merchant: otherMerchant._id,
    name: "Other merchant key",
    environment: "sandbox",
    permissions: ["payments:read"],
  });
  otherSecret = other.secretKey;
  createdIds.apiKeys.push(other.apiKey._id);

  const webhook = await MerchantWebhook.create({
    merchant: merchant._id,
    url: "http://127.0.0.1:1/aurapay-api-test",
    secret: "whsec_api_test",
    eventTypes: [
      "payment.created",
      "payment.completed",
      "payment.failed",
      "payment.refunded",
      "settlement.created",
    ],
    active: true,
  });
  createdIds.webhooks.push(webhook._id);
});

test.after(async () => {
  await ApiLog.deleteMany({ merchant: { $in: createdIds.merchants } });
  await IdempotencyKey.deleteMany({ merchant: { $in: createdIds.merchants } });
  await WebhookDelivery.deleteMany({ merchant: { $in: createdIds.merchants } });
  await MerchantWebhook.deleteMany({ merchant: { $in: createdIds.merchants } });
  await Settlement.deleteMany({ merchant: { $in: createdIds.merchants } });
  await Transaction.deleteMany({ merchant: { $in: createdIds.merchants } });
  await ApiKey.deleteMany({ merchant: { $in: createdIds.merchants } });
  await User.deleteMany({ _id: { $in: createdIds.users } });
  await Merchant.deleteMany({ _id: { $in: createdIds.merchants } });

  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

test("missing key returns 401", async () => {
  const res = await request("GET", "/api/v1/account");
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
});

test("invalid key returns 401", async () => {
  const res = await request("GET", "/api/v1/account", {
    token: "sk_test_invalid",
  });
  assert.equal(res.status, 401);
});

test("revoked key returns 401", async () => {
  const res = await request("GET", "/api/v1/payments", {
    token: revokedSecret,
  });
  assert.equal(res.status, 401);
});

test("expired key returns 401", async () => {
  const res = await request("GET", "/api/v1/payments", {
    token: expiredSecret,
  });
  assert.equal(res.status, 401);
});

test("wrong permission returns 403", async () => {
  const res = await request("POST", "/api/v1/payments", {
    token: readOnlySecret,
    idempotencyKey: "wrong-permission",
    body: {
      amount: 10,
      currency: "USD",
    },
  });
  assert.equal(res.status, 403);
});

test("successful API request creates payment and propagates request ID", async () => {
  const res = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "payment-success",
    requestId: "req_test_success",
    body: {
      amount: 12.5,
      currency: "USD",
      customerEmail: "customer@example.com",
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.headers.get("x-request-id"), "req_test_success");
  assert.equal(res.body.data.environment, "sandbox");
  assert.equal(res.body.data.livemode, false);
  assert.equal(res.body.data.sandboxScenario, "success");
  assert.equal(res.body.data.status, "completed");
  createdIds.transactions.push(res.body.data.id);
});

test("successful sandbox payment creates settlement and webhook delivery records", async () => {
  const res = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "payment-lifecycle",
    body: {
      amount: 42,
      currency: "USD",
      customerEmail: "lifecycle@example.com",
      scenario: "success",
    },
  });

  assert.equal(res.status, 201);
  createdIds.transactions.push(res.body.data.id);

  const settlement = await Settlement.findOne({
    transaction: res.body.data.id,
    merchant: merchant._id,
  });
  assert.ok(settlement);
  assert.equal(settlement.environment, "sandbox");
  assert.equal(settlement.status, "pending");
  assert.equal(settlement.amount, 42);
  assert.ok(settlement.netAmount < settlement.amount);

  await wait(250);
  const deliveries = await WebhookDelivery.find({
    merchant: merchant._id,
    eventType: { $in: ["payment.completed", "settlement.created"] },
  });
  assert.ok(deliveries.length >= 2);
  assert.ok(deliveries.every((delivery) => delivery.environment === "sandbox"));
});

test("sandbox declined payment produces failed transaction without settlement", async () => {
  const res = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "payment-declined",
    body: {
      amount: 18,
      currency: "USD",
      scenario: "declined",
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, "failed");
  assert.equal(res.body.data.sandboxScenario, "declined");
  createdIds.transactions.push(res.body.data.id);

  const settlement = await Settlement.findOne({
    transaction: res.body.data.id,
  });
  assert.equal(settlement, null);
});

test("sandbox insufficient funds and pending scenarios are deterministic", async () => {
  const insufficient = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "payment-insufficient",
    body: {
      amount: 19,
      currency: "USD",
      scenario: "insufficient_funds",
    },
  });
  const pending = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "payment-pending",
    body: {
      amount: 20,
      currency: "USD",
      scenario: "pending",
    },
  });

  assert.equal(insufficient.status, 201);
  assert.equal(insufficient.body.data.status, "failed");
  assert.equal(insufficient.body.data.sandboxScenario, "insufficient_funds");
  assert.equal(pending.status, 201);
  assert.equal(pending.body.data.status, "pending");
  assert.equal(pending.body.data.sandboxScenario, "pending");
  createdIds.transactions.push(insufficient.body.data.id, pending.body.data.id);
});

test("sandbox partial and full refunds update remaining refundable amount", async () => {
  const payment = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "payment-refundable",
    body: {
      amount: 30,
      currency: "USD",
      scenario: "success",
    },
  });
  assert.equal(payment.status, 201);
  createdIds.transactions.push(payment.body.data.id);

  const partial = await request("POST", "/api/v1/refunds", {
    token: fullSecret,
    idempotencyKey: "refund-partial",
    body: {
      transactionId: payment.body.data.id,
      amount: 10,
      reason: "requested_by_customer",
    },
  });
  assert.equal(partial.status, 201);
  assert.equal(partial.body.data.status, "completed");
  assert.equal(partial.body.data.refund.refundAmount, 10);

  const overRefund = await request("POST", "/api/v1/refunds", {
    token: fullSecret,
    idempotencyKey: "refund-over",
    body: {
      transactionId: payment.body.data.id,
      amount: 25,
    },
  });
  assert.equal(overRefund.status, 400);

  const full = await request("POST", "/api/v1/refunds", {
    token: fullSecret,
    idempotencyKey: "refund-full",
    body: {
      transactionId: payment.body.data.id,
      amount: 20,
    },
  });
  assert.equal(full.status, 201);
  assert.equal(full.body.data.status, "refunded");
  assert.equal(full.body.data.refund.refundAmount, 30);
});

test("merchant isolation prevents cross-merchant access", async () => {
  const payment = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "payment-isolation",
    body: {
      amount: 9,
      currency: "USD",
    },
  });
  assert.equal(payment.status, 201);

  const res = await request("GET", `/api/v1/payments/${payment.body.data.id}`, {
    token: otherSecret,
  });
  assert.equal(res.status, 404);
});

test("invalid ObjectId returns 400", async () => {
  const res = await request("GET", "/api/v1/payments/not-an-id", {
    token: fullSecret,
  });
  assert.equal(res.status, 400);
});

test("invalid amount returns 400", async () => {
  const res = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: "invalid-amount",
    body: {
      amount: 0,
      currency: "USD",
    },
  });
  assert.equal(res.status, 400);
});

test("idempotent replay returns original response", async () => {
  const options = {
    token: fullSecret,
    idempotencyKey: "payment-idempotent",
    body: {
      amount: 15,
      currency: "USD",
    },
  };
  const first = await request("POST", "/api/v1/payments", options);
  const second = await request("POST", "/api/v1/payments", options);

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.data.id, second.body.data.id);
});

test("idempotency payload conflict returns 409", async () => {
  const first = await request("POST", "/api/v1/checkouts", {
    token: fullSecret,
    idempotencyKey: "checkout-conflict",
    body: {
      amount: 20,
      currency: "USD",
    },
  });
  const second = await request("POST", "/api/v1/checkouts", {
    token: fullSecret,
    idempotencyKey: "checkout-conflict",
    body: {
      amount: 21,
      currency: "USD",
    },
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
});

test("rate limiting returns 429", async () => {
  process.env.API_RATE_LIMIT_MAX = "1";
  process.env.API_RATE_LIMIT_WINDOW_MS = "60000";
  const limited = await apiKeyService.createApiKey({
    merchant: merchant._id,
    name: "Limited test key",
    environment: "sandbox",
    permissions: ["payments:read"],
  });
  createdIds.apiKeys.push(limited.apiKey._id);

  const first = await request("GET", "/api/v1/payments", {
    token: limited.secretKey,
  });
  const second = await request("GET", "/api/v1/payments", {
    token: limited.secretKey,
  });

  process.env.API_RATE_LIMIT_MAX = "1000";
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.ok(second.headers.get("retry-after"));
});

test("API log is created", async () => {
  await wait(250);
  const log = await ApiLog.findOne({
    merchant: merchant._id,
    requestId: "req_test_success",
  });
  assert.ok(log);
  assert.equal(log.method, "POST");
  assert.equal(log.status, 201);
});

test("server remains stable after failed requests", async () => {
  await request("GET", "/api/v1/payments/bad-id", {
    token: fullSecret,
  });
  const res = await request("GET", "/test");
  assert.equal(res.status, 200);
});

async function request(method, path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  if (options.requestId) {
    headers["X-Request-Id"] = options.requestId;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    status: res.status,
    headers: res.headers,
    body,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
