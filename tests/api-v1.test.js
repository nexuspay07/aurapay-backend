const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("http");
const mongoose = require("mongoose");
const { assertSafeDestructiveOperation, connectTestDatabase, disconnectTestDatabase, runId } = require("./helpers/testDatabase");
const { installExternalNetworkTripwire } = require("./helpers/networkIsolation");

process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || "1000";
process.env.API_RATE_LIMIT_WINDOW_MS =
  process.env.API_RATE_LIMIT_WINDOW_MS || "60000";
process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET =
  process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET || "phase-11a-test-only-provider-idempotency-secret";

const app = require("../app");
const ApiKey = require("../models/ApiKey");
const ApiLog = require("../models/ApiLog");
const Event = require("../models/Event");
const IdempotencyKey = require("../models/IdempotencyKey");
const Merchant = require("../models/Merchant");
const MerchantWebhook = require("../models/MerchantWebhook");
const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const WebhookDelivery = require("../models/WebhookDelivery");
const apiKeyService = require("../services/apiKeyService");
const { providerRegistry, SANDBOX_PROVIDER_ID } = require("../services/providers/providerRegistry");
const {
  STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
  createStripeExternalSandboxPaymentProvider,
} = require("../services/providers/stripeExternalSandboxPaymentProvider");
const { createSandboxApiKey, createVerifiedMerchantAccount } = require("./helpers/merchantFixtures");

let server;
let baseUrl;
let merchant;
let otherMerchant;
let owner;
let otherOwner;
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
  installExternalNetworkTripwire();
  await connectTestDatabase();

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  ({ merchant, owner } = await createVerifiedMerchantAccount());
  ({ merchant: otherMerchant, owner: otherOwner } = await createVerifiedMerchantAccount());
  createdIds.merchants.push(merchant._id, otherMerchant._id);
  createdIds.users.push(owner._id, otherOwner._id);

  const full = await createSandboxApiKey(merchant, {
    name: "Full test key",
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

  const readOnly = await createSandboxApiKey(merchant, {
    name: "Read-only test key",
    permissions: ["payments:read"],
  });
  readOnlySecret = readOnly.secretKey;
  createdIds.apiKeys.push(readOnly.apiKey._id);

  const revoked = await createSandboxApiKey(merchant, {
    name: "Revoked test key",
    permissions: ["payments:read"],
  });
  revokedSecret = revoked.secretKey;
  await ApiKey.findByIdAndUpdate(revoked.apiKey._id, { active: false });
  createdIds.apiKeys.push(revoked.apiKey._id);

  const expired = await createSandboxApiKey(merchant, {
    name: "Expired test key",
    permissions: ["payments:read"],
    expiresAt: new Date(Date.now() - 1000),
  });
  expiredSecret = expired.secretKey;
  createdIds.apiKeys.push(expired.apiKey._id);

  const other = await createSandboxApiKey(otherMerchant, {
    name: "Other merchant key",
    permissions: ["payments:create", "payments:read"],
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
  assertSafeDestructiveOperation();
  await ApiLog.deleteMany({ merchant: { $in: createdIds.merchants } });
  await IdempotencyKey.deleteMany({ merchant: { $in: createdIds.merchants } });
  await Event.deleteMany({ merchant: { $in: createdIds.merchants } });
  await WebhookDelivery.deleteMany({ merchant: { $in: createdIds.merchants } });
  await MerchantWebhook.deleteMany({ merchant: { $in: createdIds.merchants } });
  await Settlement.deleteMany({ merchant: { $in: createdIds.merchants } });
  await Transaction.deleteMany({ merchant: { $in: createdIds.merchants } });
  await ApiKey.deleteMany({ merchant: { $in: createdIds.merchants } });
  await User.deleteMany({ _id: { $in: createdIds.users } });
  await Merchant.deleteMany({ _id: { $in: createdIds.merchants } });

  await new Promise((resolve) => server.close(resolve));
  await disconnectTestDatabase();
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

test("payment provider selection defaults safely and supports approved sandbox adapters", async () => {
  const cases = [
    ["provider-default", undefined, "aurapay_sandbox", "success", "completed"],
    ["provider-aurapay", "aurapay_sandbox", "aurapay_sandbox", "success", "completed"],
    ["provider-stripe", "stripe_sandbox", "stripe_sandbox", "declined", "failed"],
    ["provider-paypal", "paypal_sandbox", "paypal_sandbox", "pending", "pending"],
  ];

  for (const [idempotencyKey, provider, expectedProvider, scenario, status] of cases) {
    const body = { amount: 25, currency: "CAD", scenario };
    if (provider) body.provider = provider;

    const res = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey,
      body,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.provider, "Test");
    assert.equal(res.body.data.environment, "sandbox");
    assert.equal(res.body.data.livemode, false);
    assert.equal(res.body.data.status, status);
    assert.deepEqual(res.body.meta.routing, {
      mode: "explicit",
      requestedProvider: expectedProvider,
      selectedProvider: expectedProvider,
      policy: "explicit_v1",
      reason: "explicit_provider",
    });

    const transaction = await Transaction.findById(res.body.data.id);
    assert.equal(transaction.rawProviderResponse.provider, expectedProvider);
    assert.equal(transaction.routing.selectedProvider, expectedProvider);
    createdIds.transactions.push(res.body.data.id);
  }
});

test("auto provider uses deterministic sandbox demonstration routing", async () => {
  const cases = [
    ["auto-cad", "CAD", "aurapay_sandbox", "sandbox_demo_cad"],
    ["auto-usd", "USD", "stripe_sandbox", "sandbox_demo_usd"],
    ["auto-eur", "EUR", "paypal_sandbox", "sandbox_demo_fallback"],
  ];

  for (const [idempotencyKey, currency, selectedProvider, reason] of cases) {
    const res = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 26, currency, provider: "auto" },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.meta.routing, {
      mode: "auto",
      requestedProvider: "auto",
      selectedProvider,
      policy: "sandbox_demo_v1",
      reason,
    });
    assert.equal(JSON.stringify(res.body.meta.routing).includes("credential"), false);
    assert.equal(JSON.stringify(res.body.meta.routing).includes("payload"), false);

    const transaction = await Transaction.findById(res.body.data.id);
    assert.equal(transaction.routing.selectedProvider, selectedProvider);
    assert.equal(transaction.rawProviderResponse.provider, selectedProvider);
    createdIds.transactions.push(res.body.data.id);
  }
});

test("unapproved and real provider names fail as client errors", async () => {
  for (const provider of ["stripe", "paypal", "unknown_provider"]) {
    const res = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey: `unsupported-${provider}`,
      body: { amount: 25, currency: "CAD", provider },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "unsupported_provider");
    assert.equal(await IdempotencyKey.countDocuments({
      merchant: merchant._id,
      endpoint: "POST /api/v1/payments",
      key: `unsupported-${provider}`,
    }), 0);
  }
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

test("Phase 6 payment inspector explains sandbox outcomes with tenant-safe evidence", async () => {
  const scenarios = [
    ["success", "completed", "Payment completed"],
    ["declined", "failed", "Card declined"],
    ["insufficient_funds", "failed", "Insufficient funds"],
    ["pending", "pending", "Payment processing"],
  ];

  for (const [scenario, status, title] of scenarios) {
    const created = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      requestId: `req_inspector_${scenario}`,
      idempotencyKey: `inspector-${scenario}`,
      body: { amount: 40, currency: "CAD", customerEmail: `${scenario}@example.com`, scenario },
    });
    assert.equal(created.status, 201);
    createdIds.transactions.push(created.body.data.id);

    const inspected = await request("GET", `/api/v1/payments/${created.body.data.id}/inspect`, { token: fullSecret });
    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.data.payment.status, status);
    assert.equal(inspected.body.data.summary.title, title);
    assert.equal(inspected.body.data.payment.environment, "sandbox");
    assert.deepEqual(inspected.body.data.timeline.map((step) => step.key), [
      "request_received", "api_key_authenticated", "request_validated", "sandbox_simulation",
      "authorization", "transaction_recorded", "settlement", "events", "webhooks",
    ]);
    assert.ok(inspected.body.data.events.count >= 1);
    assert.equal(Boolean(inspected.body.data.settlement), scenario === "success");
    assert.equal(inspected.body.data.financialImpact.chargedAmount, scenario === "success" ? 40 : 0);
    assert.equal(inspected.body.data.developer.requestId, `req_inspector_${scenario}`);
    assert.match(inspected.body.data.developer.idempotencyReference, /^idem_[a-f0-9]{12}$/);

    const serialized = JSON.stringify(inspected.body).toLowerCase();
    for (const forbidden of ["bearer ", "secretkeyhash", "webhook signing", "passwordhash", "verificationtoken", "resettoken", "refreshtoken", "sessiontoken", "stack trace"]) {
      assert.equal(serialized.includes(forbidden), false, `response contained ${forbidden}`);
    }

    const isolated = await request("GET", `/api/v1/payments/${created.body.data.id}/inspect`, { token: otherSecret });
    assert.equal(isolated.status, 404);
  }

  const missing = await request("GET", "/api/v1/payments/507f1f77bcf86cd799439011/inspect", { token: fullSecret });
  assert.equal(missing.status, 404);
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

test("payment idempotent replay and conflict do not execute the provider again", async () => {
  const options = {
    token: fullSecret,
    idempotencyKey: "payment-idempotent",
    body: {
      amount: 15,
      currency: "USD",
    },
  };
  const provider = providerRegistry.resolve(SANDBOX_PROVIDER_ID);
  const executePayment = provider.executePayment;
  let executions = 0;
  provider.executePayment = async (...args) => {
    executions += 1;
    return executePayment.apply(provider, args);
  };

  try {
    const first = await request("POST", "/api/v1/payments", options);
    const replay = await request("POST", "/api/v1/payments", options);
    const conflict = await request("POST", "/api/v1/payments", {
      ...options,
      body: { ...options.body, amount: 16 },
    });

    assert.equal(first.status, 201);
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.body, first.body);
    assert.equal(first.body.data.id, replay.body.data.id);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "idempotency_conflict");
    assert.equal(executions, 1);
    createdIds.transactions.push(first.body.data.id);
  } finally {
    provider.executePayment = executePayment;
  }
});

test("20 concurrent equivalent payments reserve once and create one lifecycle", async () => {
  const idempotencyKey = `concurrent-${runId}`;
  const provider = providerRegistry.resolve(SANDBOX_PROVIDER_ID);
  const executePayment = provider.executePayment;
  let executions = 0;
  let releaseProvider;
  let signalProviderEntered;
  const providerEntered = new Promise((resolve) => { signalProviderEntered = resolve; });
  const providerRelease = new Promise((resolve) => { releaseProvider = resolve; });

  provider.executePayment = async (...args) => {
    executions += 1;
    signalProviderEntered();
    await providerRelease;
    return executePayment.apply(provider, args);
  };

  try {
    const options = {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 31, currency: "CAD", scenario: "success" },
    };
    const requests = Array.from({ length: 20 }, () => request("POST", "/api/v1/payments", options));

    await providerEntered;
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseProvider();
    const responses = await Promise.all(requests);

    assert.equal(executions, 1);
    assert.equal(responses.some((response) => response.status === 201), true);
    for (const response of responses) {
      assert.equal([201, 409].includes(response.status), true);
      if (response.status === 409) assert.equal(response.body.error.code, "idempotency_in_progress");
    }

    const transactions = await Transaction.find({ merchant: merchant._id, idempotencyKey });
    assert.equal(transactions.length, 1);
    createdIds.transactions.push(transactions[0]._id);
    const settlements = await Settlement.find({ transaction: transactions[0]._id });
    assert.equal(settlements.length, 1);
    const events = await Event.find({
      $or: [
        { resourceType: "transaction", resourceId: transactions[0]._id },
        { resourceType: "settlement", resourceId: settlements[0]._id },
      ],
    });
    assert.deepEqual(events.map((event) => event.eventType).sort(), [
      "payment.completed",
      "payment.created",
      "settlement.created",
    ]);

    const reservation = await IdempotencyKey.findOne({ merchant: merchant._id, key: idempotencyKey });
    assert.equal(reservation.state, "completed");
    assert.ok(reservation.providerIdempotencyKey);
    assert.equal(reservation.providerIdempotencyKey.includes(idempotencyKey), false);
    assert.ok(reservation.completedAt);
    assert.ok(Math.abs(reservation.expiresAt.getTime() - reservation.completedAt.getTime() - 24 * 60 * 60 * 1000) < 1000);
  } finally {
    releaseProvider?.();
    provider.executePayment = executePayment;
  }
});

test("changed payload conflicts while the original payment is in progress", async () => {
  const idempotencyKey = `in-progress-conflict-${runId}`;
  const provider = providerRegistry.resolve(SANDBOX_PROVIDER_ID);
  const executePayment = provider.executePayment;
  let executions = 0;
  let releaseProvider;
  let signalProviderEntered;
  const providerEntered = new Promise((resolve) => { signalProviderEntered = resolve; });
  const providerRelease = new Promise((resolve) => { releaseProvider = resolve; });

  provider.executePayment = async (...args) => {
    executions += 1;
    signalProviderEntered();
    await providerRelease;
    return executePayment.apply(provider, args);
  };

  try {
    const firstPromise = request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 32, currency: "CAD" },
    });
    await providerEntered;
    const conflict = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 33, currency: "CAD" },
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "idempotency_conflict");
    assert.equal(executions, 1);

    releaseProvider();
    const first = await firstPromise;
    assert.equal(first.status, 201);
    createdIds.transactions.push(first.body.data.id);
  } finally {
    releaseProvider?.();
    provider.executePayment = executePayment;
  }
});

test("same raw idempotency key is isolated across merchants", async () => {
  const key = `shared-${runId}`;
  const first = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: key,
    body: { amount: 34, currency: "CAD" },
  });
  const second = await request("POST", "/api/v1/payments", {
    token: otherSecret,
    idempotencyKey: key,
    body: { amount: 34, currency: "CAD" },
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.body.data.id, second.body.data.id);
  createdIds.transactions.push(first.body.data.id, second.body.data.id);

  const reservations = await IdempotencyKey.find({ key }).sort({ merchant: 1 });
  assert.equal(reservations.length, 2);
  assert.notEqual(reservations[0].providerIdempotencyKey, reservations[1].providerIdempotencyKey);
  const isolated = await request("GET", `/api/v1/payments/${first.body.data.id}`, { token: otherSecret });
  assert.equal(isolated.status, 404);
});

test("uncertain provider failure leaves a non-expiring reservation and blocks retry", async () => {
  const idempotencyKey = `uncertain-${runId}`;
  const provider = providerRegistry.resolve(SANDBOX_PROVIDER_ID);
  const executePayment = provider.executePayment;
  let executions = 0;
  provider.executePayment = async () => {
    executions += 1;
    throw new Error("simulated provider timeout");
  };

  try {
    const options = { token: fullSecret, idempotencyKey, body: { amount: 35, currency: "CAD" } };
    const first = await request("POST", "/api/v1/payments", options);
    const duplicate = await request("POST", "/api/v1/payments", options);
    assert.equal(first.status, 500);
    assert.equal(first.body.error.code, "internal_error");
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "idempotency_in_progress");
    assert.equal(executions, 1);
    assert.equal(await Transaction.countDocuments({ merchant: merchant._id, idempotencyKey }), 0);

    const reservation = await IdempotencyKey.findOne({ merchant: merchant._id, key: idempotencyKey });
    assert.equal(reservation.state, "in_progress");
    assert.equal(reservation.expiresAt, undefined);
  } finally {
    provider.executePayment = executePayment;
  }
});

test("idempotency finalization failure fails closed and blocks duplicate execution", async () => {
  const idempotencyKey = `finalization-failure-${runId}`;
  const provider = providerRegistry.resolve(SANDBOX_PROVIDER_ID);
  const executePayment = provider.executePayment;
  const updateOne = IdempotencyKey.updateOne;
  let executions = 0;

  provider.executePayment = async (...args) => {
    executions += 1;
    return executePayment.apply(provider, args);
  };
  IdempotencyKey.updateOne = async (filter, ...args) => {
    if (filter?.state === "in_progress") throw new Error("simulated finalization failure");
    return updateOne.call(IdempotencyKey, filter, ...args);
  };

  try {
    const options = { token: fullSecret, idempotencyKey, body: { amount: 36, currency: "CAD" } };
    const first = await request("POST", "/api/v1/payments", options);
    const duplicate = await request("POST", "/api/v1/payments", options);
    assert.equal(first.status, 500);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "idempotency_in_progress");
    assert.equal(executions, 1);

    const transactions = await Transaction.find({ merchant: merchant._id, idempotencyKey });
    assert.equal(transactions.length, 1);
    createdIds.transactions.push(transactions[0]._id);
    const reservation = await IdempotencyKey.findOne({ merchant: merchant._id, key: idempotencyKey });
    assert.equal(reservation.state, "in_progress");
    assert.equal(reservation.expiresAt, undefined);
  } finally {
    IdempotencyKey.updateOne = updateOne;
    provider.executePayment = executePayment;
  }
});

test("legacy idempotency records without state replay as completed", async () => {
  const key = `legacy-${runId}`;
  const body = { amount: 37, currency: "CAD", provider: "aurapay_sandbox" };
  const responseBody = { success: true, data: { id: "legacy_transaction_id" }, meta: { legacy: true } };
  const { hashPayload } = require("../routes/api/v1/utils");
  await IdempotencyKey.collection.insertOne({
    merchant: merchant._id,
    endpoint: "POST /api/v1/payments",
    key,
    requestHash: hashPayload(body),
    statusCode: 201,
    responseBody,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const replay = await request("POST", "/api/v1/payments", {
    token: fullSecret,
    idempotencyKey: key,
    body: { amount: 37, currency: "CAD" },
  });
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body, responseBody);
});

test("external Stripe sandbox uses the stored opaque key and returns only normalized AuraPay data", async () => {
  const calls = [];
  const adapter = createStripeExternalSandboxPaymentProvider({
    stripeClient: {
      paymentIntents: {
        async create(params, options) {
          calls.push({ params, options });
          return {
            object: "payment_intent",
            id: `pi_external_success_${runId}`,
            livemode: false,
            amount: params.amount,
            currency: params.currency,
            status: "succeeded",
            client_secret: "must_not_escape",
            payment_method: { card: { last4: "4242" } },
            last_payment_error: { message: "native error must not escape" },
            lastResponse: { headers: { authorization: "Bearer must_not_escape" } },
          };
        },
      },
    },
  });
  providerRegistry.adapters.set(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID, adapter);

  try {
    const idempotencyKey = `external-success-${runId}`;
    const options = {
      token: fullSecret,
      idempotencyKey,
      body: {
        amount: 41.23,
        currency: "USD",
        customerEmail: "external-success@example.com",
        description: "AuraPay-only description",
        scenario: "success",
        provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
      },
    };
    const first = await request("POST", "/api/v1/payments", options);
    const replay = await request("POST", "/api/v1/payments", options);

    assert.equal(first.status, 201);
    assert.equal(first.body.success, true);
    assert.equal(first.body.data.status, "completed");
    assert.equal(first.body.data.success, true);
    assert.equal(first.body.meta.outcome, "payment_completed");
    assert.equal(first.body.meta.routing.selectedProvider, STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
    assert.deepEqual(replay.body, first.body);
    assert.equal(calls.length, 1);

    const reservation = await IdempotencyKey.findOne({ merchant: merchant._id, key: idempotencyKey });
    assert.deepEqual(calls[0], {
      params: {
        amount: 4123,
        currency: "usd",
        payment_method: "pm_card_visa",
        payment_method_types: ["card"],
        confirm: true,
      },
      options: {
        idempotencyKey: reservation.providerIdempotencyKey,
        timeout: 10000,
        maxNetworkRetries: 0,
      },
    });
    assert.equal(calls[0].options.idempotencyKey, reservation.providerIdempotencyKey);
    assert.equal(calls[0].options.idempotencyKey.includes(idempotencyKey), false);
    assert.equal(reservation.state, "completed");
    assert.equal(reservation.statusCode, 201);
    assert.deepEqual(JSON.parse(JSON.stringify(reservation.responseBody)), first.body);

    const transaction = await Transaction.findById(first.body.data.id);
    createdIds.transactions.push(transaction._id);
    assert.equal(transaction.status, "completed");
    assert.equal(transaction.success, true);
    assert.equal(transaction.routing.selectedProvider, STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
    assert.equal(transaction.providerPaymentId, `pi_external_success_${runId}`);
    assert.deepEqual(transaction.rawProviderResponse, {
      provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
      scenario: "success",
      code: "payment_completed",
      livemode: false,
    });
    const settlements = await Settlement.find({ transaction: transaction._id });
    assert.equal(settlements.length, 1);
    assert.equal(settlements[0].status, "pending");
    assert.equal(String(first.body.meta.settlementId), String(settlements[0]._id));

    const events = await Event.find({
      $or: [
        { resourceType: "transaction", resourceId: transaction._id },
        { resourceType: "settlement", resourceId: settlements[0]._id },
      ],
    });
    assert.deepEqual(events.map(({ eventType }) => eventType).sort(), [
      "payment.completed",
      "payment.created",
      "settlement.created",
    ]);

    const providerCall = JSON.stringify(calls[0]);
    for (const forbidden of [
      idempotencyKey,
      String(merchant._id),
      "external-success@example.com",
      "AuraPay-only description",
      "X-Request-Id",
      "requestId",
      "metadata",
      "sk_test_",
    ]) {
      assert.equal(providerCall.includes(forbidden), false);
    }

    const quarantined = JSON.stringify({
      response: first.body,
      providerStorage: transaction.rawProviderResponse,
      events: events.map(({ payload }) => payload),
      replay: reservation.responseBody,
    });
    for (const forbidden of [
      "client_secret",
      "payment_method",
      "last_payment_error",
      "lastResponse",
      "last4",
      "native error must not escape",
      "authorization",
      "sk_test_",
      "rawProviderResponse",
    ]) {
      assert.equal(quarantined.includes(forbidden), false);
    }

    await assert.rejects(
      () => Transaction.create({
        merchant: merchant._id,
        amount: transaction.amount,
        currency: transaction.currency,
        provider: "Test",
        paymentType: "test",
        providerPaymentId: transaction.providerPaymentId,
        status: "completed",
        success: true,
        environment: "sandbox",
        livemode: false,
        sandboxScenario: "success",
        routing: {
          mode: "explicit",
          requestedProvider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
          selectedProvider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
          policy: "explicit_v1",
          reason: "explicit_provider",
        },
      }),
      (error) => error?.code === 11000
    );
  } finally {
    providerRegistry.adapters.delete(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
  }
});

test("external Stripe definitive declines persist normalized failures without native leakage", async () => {
  const cases = [
    {
      scenario: "declined",
      declineCode: "generic_decline",
      outcomeCode: "card_declined",
      message: "Stripe test payment was declined.",
      paymentMethod: "pm_card_visa_chargeDeclined",
    },
    {
      scenario: "insufficient_funds",
      declineCode: "insufficient_funds",
      outcomeCode: "insufficient_funds",
      message: "Stripe test payment failed due to insufficient funds.",
      paymentMethod: "pm_card_visa_chargeDeclinedInsufficientFunds",
    },
  ];

  for (const testCase of cases) {
    const calls = [];
    const paymentIntentId = `pi_external_${testCase.scenario}_${runId}`;
    const adapter = createStripeExternalSandboxPaymentProvider({
      stripeClient: {
        paymentIntents: {
          async create(params, options) {
            calls.push({ params, options });
            const error = new Error("raw Stripe decline diagnostic must not escape");
            error.code = "card_declined";
            error.decline_code = testCase.declineCode;
            error.stack = "raw Stripe stack must not escape";
            error.headers = { authorization: "Bearer sk_test_must_not_escape" };
            error.payment_intent = {
              object: "payment_intent",
              id: paymentIntentId,
              livemode: false,
              amount: params.amount,
              currency: params.currency,
              status: "requires_payment_method",
              client_secret: "decline_secret_must_not_escape",
              payment_method: { card: { last4: "0002" } },
              last_payment_error: { message: error.message },
              lastResponse: { headers: error.headers },
            };
            throw error;
          },
        },
      },
    });
    providerRegistry.adapters.set(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID, adapter);

    try {
      const idempotencyKey = `external-${testCase.scenario}-${runId}`;
      const options = {
        token: fullSecret,
        idempotencyKey,
        body: {
          amount: 45.67,
          currency: "USD",
          customerEmail: `${testCase.scenario}@example.com`,
          description: "AuraPay-only decline description",
          scenario: testCase.scenario,
          provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
        },
      };
      const first = await request("POST", "/api/v1/payments", options);
      const replay = await request("POST", "/api/v1/payments", options);

      assert.equal(first.status, 201);
      assert.equal(first.body.success, true);
      assert.equal(first.body.data.status, "failed");
      assert.equal(first.body.data.success, false);
      assert.equal(first.body.meta.outcome, testCase.outcomeCode);
      assert.equal(first.body.meta.settlementId, null);
      assert.equal(first.body.meta.routing.selectedProvider, STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
      assert.deepEqual(replay.body, first.body);
      assert.equal(calls.length, 1);

      const reservation = await IdempotencyKey.findOne({ merchant: merchant._id, key: idempotencyKey });
      assert.deepEqual(calls[0], {
        params: {
          amount: 4567,
          currency: "usd",
          payment_method: testCase.paymentMethod,
          payment_method_types: ["card"],
          confirm: true,
        },
        options: {
          idempotencyKey: reservation.providerIdempotencyKey,
          timeout: 10000,
          maxNetworkRetries: 0,
        },
      });
      assert.equal(reservation.state, "completed");
      assert.equal(reservation.statusCode, 201);
      assert.deepEqual(JSON.parse(JSON.stringify(reservation.responseBody)), first.body);

      const transaction = await Transaction.findById(first.body.data.id);
      createdIds.transactions.push(transaction._id);
      assert.equal(transaction.status, "failed");
      assert.equal(transaction.success, false);
      assert.equal(transaction.errorMessage, testCase.message);
      assert.equal(transaction.providerPaymentId, paymentIntentId);
      assert.equal(transaction.routing.selectedProvider, STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
      assert.deepEqual(transaction.rawProviderResponse, {
        provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
        scenario: testCase.scenario,
        code: testCase.outcomeCode,
        livemode: false,
      });
      assert.equal(await Settlement.countDocuments({ transaction: transaction._id }), 0);

      const events = await Event.find({ resourceType: "transaction", resourceId: transaction._id });
      assert.deepEqual(events.map(({ eventType }) => eventType).sort(), ["payment.created", "payment.failed"]);
      const failedEvent = events.find(({ eventType }) => eventType === "payment.failed");
      assert.equal(failedEvent.payload.failureCode, testCase.outcomeCode);
      assert.equal(failedEvent.payload.failureMessage, testCase.message);

      const providerCall = JSON.stringify(calls[0]);
      for (const forbidden of [
        idempotencyKey,
        String(merchant._id),
        `${testCase.scenario}@example.com`,
        "AuraPay-only decline description",
        "requestId",
        "metadata",
        "sk_test_",
      ]) {
        assert.equal(providerCall.includes(forbidden), false);
      }

      const quarantined = JSON.stringify({
        response: first.body,
        transaction: transaction.rawProviderResponse,
        events: events.map(({ payload }) => payload),
        replay: reservation.responseBody,
      });
      for (const forbidden of [
        "client_secret",
        "payment_method",
        "last_payment_error",
        "lastResponse",
        "last4",
        "raw Stripe decline diagnostic",
        "raw Stripe stack",
        "authorization",
        "sk_test_",
      ]) {
        assert.equal(quarantined.includes(forbidden), false);
      }
    } finally {
      providerRegistry.adapters.delete(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
    }
  }
});

test("external Stripe sandbox rejects unsupported input before reservation", async () => {
  let calls = 0;
  const adapter = createStripeExternalSandboxPaymentProvider({
    stripeClient: {
      paymentIntents: {
        async create() {
          calls += 1;
          throw new Error("must not execute");
        },
      },
    },
  });
  providerRegistry.adapters.set(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID, adapter);

  try {
    const cases = [
      [`external-currency-${runId}`, { amount: 10, currency: "EUR", scenario: "success" }],
      [`external-precision-${runId}`, { amount: 10.001, currency: "USD", scenario: "success" }],
      [`external-precision-boundary-${runId}`, { amount: 1.00000000001, currency: "USD", scenario: "success" }],
      [`external-provider-minimum-${runId}`, { amount: 0.49, currency: "USD", scenario: "success" }],
      [`external-scenario-${runId}`, { amount: 10, currency: "USD", scenario: "pending" }],
    ];
    for (const [key, body] of cases) {
      const response = await request("POST", "/api/v1/payments", {
        token: fullSecret,
        idempotencyKey: key,
        body: { ...body, provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID },
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "invalid_request");
      assert.equal(await IdempotencyKey.countDocuments({ merchant: merchant._id, key }), 0);
      assert.equal(await Transaction.countDocuments({ merchant: merchant._id, idempotencyKey: key }), 0);
    }
    assert.equal(calls, 0);
  } finally {
    providerRegistry.adapters.delete(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
  }
});

test("20 concurrent external Stripe requests produce one logical provider operation", async () => {
  let calls = 0;
  let release;
  let signalEntered;
  const entered = new Promise((resolve) => { signalEntered = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const adapter = createStripeExternalSandboxPaymentProvider({
    stripeClient: {
      paymentIntents: {
        async create(params) {
          calls += 1;
          signalEntered();
          await blocked;
          return {
            object: "payment_intent",
            id: `pi_external_concurrent_${runId}`,
            livemode: false,
            amount: params.amount,
            currency: params.currency,
            status: "succeeded",
          };
        },
      },
    },
  });
  providerRegistry.adapters.set(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID, adapter);

  try {
    const idempotencyKey = `external-concurrent-${runId}`;
    const options = {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 42, currency: "CAD", scenario: "success", provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID },
    };
    const requests = Array.from({ length: 20 }, () => request("POST", "/api/v1/payments", options));
    await entered;
    const conflict = await request("POST", "/api/v1/payments", {
      ...options,
      body: { ...options.body, amount: 42.01 },
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "idempotency_conflict");
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    const responses = await Promise.all(requests);

    assert.equal(calls, 1);
    assert.equal(responses.some((response) => response.status === 201), true);
    assert.equal(await Transaction.countDocuments({ merchant: merchant._id, idempotencyKey }), 1);
    const transaction = await Transaction.findOne({ merchant: merchant._id, idempotencyKey });
    createdIds.transactions.push(transaction._id);
    const settlements = await Settlement.find({ transaction: transaction._id });
    assert.equal(settlements.length, 1);
    const events = await Event.find({
      $or: [
        { resourceType: "transaction", resourceId: transaction._id },
        { resourceType: "settlement", resourceId: settlements[0]._id },
      ],
    });
    assert.deepEqual(events.map(({ eventType }) => eventType).sort(), [
      "payment.completed",
      "payment.created",
      "settlement.created",
    ]);
    const reservation = await IdempotencyKey.findOne({ merchant: merchant._id, key: idempotencyKey });
    assert.equal(await IdempotencyKey.countDocuments({ merchant: merchant._id, key: idempotencyKey }), 1);
    assert.equal(reservation.state, "completed");
    assert.equal(reservation.statusCode, 201);
    assert.ok(reservation.completedAt);
    for (const response of responses) {
      assert.equal([201, 409].includes(response.status), true);
      if (response.status === 409) assert.equal(response.body.error.code, "idempotency_in_progress");
    }
  } finally {
    release?.();
    providerRegistry.adapters.delete(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
  }
});

test("external Stripe uncertainty remains in progress and blocks a duplicate", async () => {
  const calls = [];
  const adapter = createStripeExternalSandboxPaymentProvider({
    stripeClient: {
      paymentIntents: {
        async create(params, options) {
          calls.push({ params, options });
          const error = new Error("raw Stripe timeout diagnostic with sk_test_must_not_escape");
          error.type = "StripeConnectionError";
          error.code = "ETIMEDOUT";
          error.headers = { authorization: "Bearer must_not_escape" };
          error.raw = { requestId: "req_native_must_not_escape", payment_method: { card: { last4: "4242" } } };
          throw error;
        },
      },
    },
  });
  providerRegistry.adapters.set(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID, adapter);

  try {
    const idempotencyKey = `external-timeout-${runId}`;
    const options = {
      token: fullSecret,
      idempotencyKey,
      body: {
        amount: 43,
        currency: "USD",
        customerEmail: "uncertain@example.com",
        description: "AuraPay-only uncertainty description",
        scenario: "success",
        provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
      },
    };
    const countsBefore = {
      transactions: await Transaction.countDocuments({ merchant: merchant._id }),
      settlements: await Settlement.countDocuments({ merchant: merchant._id }),
      events: await Event.countDocuments({ merchant: merchant._id }),
    };
    const first = await request("POST", "/api/v1/payments", options);
    const duplicate = await request("POST", "/api/v1/payments", options);

    assert.equal(first.status, 500);
    assert.deepEqual(first.body, {
      success: false,
      error: { code: "internal_error", message: "Failed to create payment." },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "idempotency_in_progress");
    assert.equal(calls.length, 1);
    assert.equal(await Transaction.countDocuments({ merchant: merchant._id, idempotencyKey }), 0);
    assert.equal(await Transaction.countDocuments({ merchant: merchant._id }), countsBefore.transactions);
    assert.equal(await Settlement.countDocuments({ merchant: merchant._id }), countsBefore.settlements);
    assert.equal(await Event.countDocuments({ merchant: merchant._id }), countsBefore.events);
    const reservation = await IdempotencyKey.findOne({ merchant: merchant._id, key: idempotencyKey });
    assert.equal(reservation.state, "in_progress");
    assert.equal(reservation.expiresAt, undefined);
    assert.deepEqual(calls[0], {
      params: {
        amount: 4300,
        currency: "usd",
        payment_method: "pm_card_visa",
        payment_method_types: ["card"],
        confirm: true,
      },
      options: {
        idempotencyKey: reservation.providerIdempotencyKey,
        timeout: 10000,
        maxNetworkRetries: 0,
      },
    });
    const providerCall = JSON.stringify(calls[0]);
    for (const forbidden of [
      idempotencyKey,
      String(merchant._id),
      "uncertain@example.com",
      "AuraPay-only uncertainty description",
      "requestId",
      "req_native_must_not_escape",
      "sk_test_",
    ]) {
      assert.equal(providerCall.includes(forbidden), false);
    }
    const publicState = JSON.stringify({ first: first.body, duplicate: duplicate.body, reservation });
    for (const forbidden of [
      "raw Stripe timeout diagnostic",
      "sk_test_",
      "authorization",
      "req_native_must_not_escape",
      "payment_method",
      "last4",
    ]) {
      assert.equal(publicState.includes(forbidden), false);
    }
  } finally {
    providerRegistry.adapters.delete(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
  }
});

test("external Stripe provider idempotency remains isolated across merchants", async () => {
  const optionsSeen = [];
  let sequence = 0;
  const adapter = createStripeExternalSandboxPaymentProvider({
    stripeClient: {
      paymentIntents: {
        async create(params, options) {
          optionsSeen.push(options);
          sequence += 1;
          return {
            object: "payment_intent",
            id: `pi_external_merchant_${sequence}_${runId}`,
            livemode: false,
            amount: params.amount,
            currency: params.currency,
            status: "succeeded",
          };
        },
      },
    },
  });
  providerRegistry.adapters.set(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID, adapter);

  try {
    const idempotencyKey = `external-shared-${runId}`;
    const body = { amount: 44, currency: "CAD", scenario: "success", provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID };
    const first = await request("POST", "/api/v1/payments", { token: fullSecret, idempotencyKey, body });
    const second = await request("POST", "/api/v1/payments", { token: otherSecret, idempotencyKey, body });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(optionsSeen.length, 2);
    assert.notEqual(optionsSeen[0].idempotencyKey, optionsSeen[1].idempotencyKey);
    createdIds.transactions.push(first.body.data.id, second.body.data.id);
    assert.equal((await request("GET", `/api/v1/payments/${first.body.data.id}`, { token: otherSecret })).status, 404);
  } finally {
    providerRegistry.adapters.delete(STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
  }
});

test("payment idempotency replays equivalent default selection and conflicts on provider changes", async () => {
  const idempotencyKey = "payment-provider-idempotent";
  const provider = providerRegistry.resolve(SANDBOX_PROVIDER_ID);
  const executePayment = provider.executePayment;
  let executions = 0;
  provider.executePayment = async (...args) => {
    executions += 1;
    return executePayment.apply(provider, args);
  };

  try {
    const first = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 17, currency: "USD" },
    });
    const equivalentReplay = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 17, currency: "USD", provider: "aurapay_sandbox" },
    });
    const providerConflict = await request("POST", "/api/v1/payments", {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 17, currency: "USD", provider: "stripe_sandbox" },
    });

    assert.equal(first.status, 201);
    assert.equal(equivalentReplay.status, 201);
    assert.equal(first.body.data.id, equivalentReplay.body.data.id);
    assert.equal(providerConflict.status, 409);
    assert.equal(providerConflict.body.error.code, "idempotency_conflict");
    assert.equal(executions, 1);
    createdIds.transactions.push(first.body.data.id);
  } finally {
    provider.executePayment = executePayment;
  }
});

test("auto idempotency replays before rerouting and conflicts on changed routing intent", async () => {
  const idempotencyKey = "payment-auto-idempotent";
  const selectedProvider = providerRegistry.resolve("stripe_sandbox");
  const executePayment = selectedProvider.executePayment;
  let executions = 0;
  selectedProvider.executePayment = async (...args) => {
    executions += 1;
    return executePayment.apply(selectedProvider, args);
  };

  try {
    const options = {
      token: fullSecret,
      idempotencyKey,
      body: { amount: 27, currency: "USD", scenario: "success", provider: "auto" },
    };
    const first = await request("POST", "/api/v1/payments", options);
    const replay = await request("POST", "/api/v1/payments", options);
    const explicitConflict = await request("POST", "/api/v1/payments", {
      ...options,
      body: { ...options.body, provider: "stripe_sandbox" },
    });
    const changedCurrencyConflict = await request("POST", "/api/v1/payments", {
      ...options,
      body: { ...options.body, currency: "CAD" },
    });

    assert.equal(first.status, 201);
    assert.equal(replay.status, 201);
    assert.equal(first.body.data.id, replay.body.data.id);
    assert.equal(explicitConflict.status, 409);
    assert.equal(changedCurrencyConflict.status, 409);
    assert.equal(executions, 1);
    createdIds.transactions.push(first.body.data.id);
  } finally {
    selectedProvider.executePayment = executePayment;
  }
});

test("omitted and auto routing intents conflict under one idempotency key", async () => {
  const options = {
    token: fullSecret,
    idempotencyKey: "payment-omitted-auto-conflict",
    body: { amount: 28, currency: "CAD" },
  };
  const first = await request("POST", "/api/v1/payments", options);
  const conflict = await request("POST", "/api/v1/payments", {
    ...options,
    body: { ...options.body, provider: "auto" },
  });

  assert.equal(first.status, 201);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "idempotency_conflict");
  createdIds.transactions.push(first.body.data.id);
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
  const res = await request("GET", "/health");
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
