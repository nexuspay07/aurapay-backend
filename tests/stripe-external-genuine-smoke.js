const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");

const EXPECTED_DATABASE_NAME = "aurapay_test";
const EXTERNAL_PROVIDER_ID = "stripe_external_sandbox";
const IDEMPOTENCY_ENDPOINT = "POST /api/v1/payments";
const MINIMUM_HMAC_SECRET_LENGTH = 32;

function failPreflight(variable, reason) {
  throw new Error(`Phase 11D preflight failed: ${variable} ${reason}.`);
}

function requireExactEnvironment(variable, expected) {
  if (process.env[variable] !== expected) failPreflight(variable, `must equal ${expected}`);
}

function preflightEnvironment() {
  requireExactEnvironment("STRIPE_EXTERNAL_INTEGRATION_TESTS_ENABLED", "true");
  requireExactEnvironment("NODE_ENV", "test");
  requireExactEnvironment("STRIPE_EXTERNAL_SANDBOX_ENABLED", "true");

  const stripeKey = String(process.env.STRIPE_TEST_SECRET_KEY || "").trim();
  if (!/^sk_test_[A-Za-z0-9]{16,}$/.test(stripeKey)) {
    failPreflight("STRIPE_TEST_SECRET_KEY", "is missing or invalid");
  }

  const hmacSecret = String(process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET || "");
  if (hmacSecret.length < MINIMUM_HMAC_SECRET_LENGTH) {
    failPreflight("PROVIDER_IDEMPOTENCY_HMAC_SECRET", "is missing or insufficiently strong");
  }

  if (!String(process.env.MONGO_URI_TEST || "").trim()) {
    failPreflight("MONGO_URI_TEST", "is required");
  }
}

function safeRunId() {
  return `phase11d-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function sorted(values) {
  return [...values].sort();
}

function assertNoLeakage({ response, transaction, events, replay }, secrets) {
  const visible = JSON.stringify({
    response,
    providerStorage: transaction.rawProviderResponse,
    events: events.map((event) => event.payload),
    replay,
  });
  const lower = visible.toLowerCase();
  const forbiddenNames = [
    "client_secret",
    "last_payment_error",
    "payment_method",
    "lastresponse",
    "authorization",
    "stripe-signature",
    "raw stripe",
    "card_number",
    "last4",
  ];
  for (const name of forbiddenNames) assert.equal(lower.includes(name), false, `AuraPay surface exposed ${name}`);
  for (const secret of secrets) {
    assert.ok(secret);
    assert.equal(visible.includes(secret), false, "AuraPay surface exposed a protected value");
  }
}

async function request(baseUrl, token, idempotencyKey, requestId, body) {
  const response = await fetch(`${baseUrl}/api/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-Request-Id": requestId,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("AuraPay returned a non-JSON response.");
  }
  return { status: response.status, body: parsed };
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function main() {
  preflightEnvironment();

  const { validateTestDatabaseUri } = require("../config/testDatabaseSafety");
  const verifiedUri = validateTestDatabaseUri();
  if (verifiedUri.databaseName !== EXPECTED_DATABASE_NAME) {
    throw new Error(`Phase 11D preflight failed: connected database must be ${EXPECTED_DATABASE_NAME}.`);
  }

  const mongoose = require("mongoose");
  const { connectTestDatabase, disconnectTestDatabase } = require("./helpers/testDatabase");
  let server;
  let cleanupAllowed = false;
  let fixture;
  let runId = "not-started";
  let activeScenario = "preflight/setup";

  try {
    await connectTestDatabase();
    if (mongoose.connection.name !== EXPECTED_DATABASE_NAME) {
      throw new Error(`Phase 11D preflight failed: connected database must be ${EXPECTED_DATABASE_NAME}.`);
    }
    console.log("Phase 11D preflight passed");

    // Load AuraPay only after every static gate and the connected database identity pass.
    const app = require("../app");
    const ApiKey = require("../models/ApiKey");
    const ApiLog = require("../models/ApiLog");
    const Event = require("../models/Event");
    const IdempotencyKey = require("../models/IdempotencyKey");
    const Merchant = require("../models/Merchant");
    const Settlement = require("../models/Settlement");
    const Transaction = require("../models/Transaction");
    const User = require("../models/User");
    const { createSandboxApiKey, createVerifiedMerchantAccount } = require("./helpers/merchantFixtures");

    runId = safeRunId();
    const account = await createVerifiedMerchantAccount({
      merchant: {
        businessName: runId,
        legalName: `${runId} LLC`,
        contactEmail: `${runId}@aurapay.test`,
      },
      owner: { email: `owner-${runId}@aurapay.test` },
    });
    const key = await createSandboxApiKey(account.merchant, {
      name: runId,
      permissions: ["payments:create", "payments:read"],
    });
    fixture = {
      ApiKey,
      ApiLog,
      Event,
      IdempotencyKey,
      Merchant,
      Settlement,
      Transaction,
      User,
      merchant: account.merchant,
      owner: account.owner,
      apiKey: key.apiKey,
    };

    server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function runScenario(scenario, expectedStatus, expectedEvents) {
      activeScenario = scenario;
      const idempotencyKey = `${runId}-${scenario}-${crypto.randomBytes(8).toString("hex")}`;
      const requestId = `req_${crypto.randomBytes(12).toString("hex")}`;
      const body = { amount: 1, currency: "USD", provider: EXTERNAL_PROVIDER_ID, scenario };
      const response = await request(baseUrl, key.secretKey, idempotencyKey, requestId, body);
      const reservation = await IdempotencyKey.findOne({
        merchant: account.merchant._id,
        endpoint: IDEMPOTENCY_ENDPOINT,
        key: idempotencyKey,
      });

      if (response.status !== 201 || !reservation || reservation.state !== "completed") {
        throw new Error(`Phase 11D ${scenario} scenario did not produce a proven terminal AuraPay result; evidence was preserved.`);
      }

      assert.equal(response.body.success, true);
      assert.equal(response.body.data.status, expectedStatus);
      assert.equal(response.body.data.success, expectedStatus === "completed");
      assert.equal(response.body.data.environment, "sandbox");
      assert.equal(response.body.data.livemode, false);
      assert.equal(response.body.data.sandboxScenario, scenario);
      assert.equal(response.body.meta.routing.mode, "explicit");
      assert.equal(response.body.meta.routing.requestedProvider, EXTERNAL_PROVIDER_ID);
      assert.equal(response.body.meta.routing.selectedProvider, EXTERNAL_PROVIDER_ID);
      assert.match(String(response.body.data.paymentId || ""), /^pi_/);

      const transaction = await Transaction.findOne({
        _id: response.body.data.id,
        merchant: account.merchant._id,
      });
      assert.ok(transaction);
      assert.equal(transaction.status, expectedStatus);
      assert.equal(transaction.success, expectedStatus === "completed");
      assert.equal(transaction.environment, "sandbox");
      assert.equal(transaction.livemode, false);
      assert.equal(transaction.sandboxScenario, scenario);
      assert.equal(transaction.providerPaymentId, response.body.data.paymentId);
      assert.equal(transaction.routing.selectedProvider, EXTERNAL_PROVIDER_ID);
      assert.deepEqual(transaction.rawProviderResponse, {
        provider: EXTERNAL_PROVIDER_ID,
        scenario,
        code: scenario === "success" ? "payment_completed" : "card_declined",
        livemode: false,
      });

      const settlements = await Settlement.find({ merchant: account.merchant._id, transaction: transaction._id });
      assert.equal(settlements.length, expectedStatus === "completed" ? 1 : 0);
      if (settlements[0]) {
        assert.equal(settlements[0].environment, "sandbox");
        assert.equal(settlements[0].livemode, false);
      }

      const events = await Event.find({ merchant: account.merchant._id }).sort({ createdAt: 1 });
      const scenarioEvents = events.filter((event) =>
        String(event.resourceId) === String(transaction._id) ||
        String(event.payload?.transactionId) === String(transaction._id) ||
        event.payload?.transactionId === transaction.transactionId
      );
      assert.deepEqual(sorted(scenarioEvents.map((event) => event.eventType)), sorted(expectedEvents));
      assert.ok(scenarioEvents.every((event) => event.environment === "sandbox" && event.livemode === false));

      assert.equal(reservation.statusCode, 201);
      assert.ok(reservation.completedAt);
      assert.ok(reservation.expiresAt);
      assert.deepEqual(JSON.parse(JSON.stringify(reservation.responseBody)), response.body);
      assert.match(String(reservation.providerIdempotencyKey || ""), /^ap_pay_v1_[A-Za-z0-9_-]{43}$/);
      assert.equal(reservation.providerIdempotencyKey.includes(idempotencyKey), false);

      assertNoLeakage(
        { response: response.body, transaction, events: scenarioEvents, replay: reservation.responseBody },
        [
          process.env.STRIPE_TEST_SECRET_KEY,
          process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET,
          key.secretKey,
          idempotencyKey,
        ]
      );

      return { idempotencyKey, requestId, response, transaction, reservation, scenarioEvents };
    }

    await runScenario("success", "completed", [
      "payment.created",
      "payment.completed",
      "settlement.created",
    ]);
    console.log("Success scenario passed");

    const decline = await runScenario("declined", "failed", ["payment.created", "payment.failed"]);
    const declineEventFilter = {
      merchant: account.merchant._id,
      eventType: { $in: ["payment.created", "payment.failed"] },
      $or: [
        { resourceId: decline.transaction._id },
        { "payload.transactionId": decline.transaction._id },
        { "payload.transactionId": decline.transaction.transactionId },
        { "payload.paymentId": decline.transaction.providerPaymentId },
      ],
    };
    async function replayCounts() {
      const [transactions, settlements, events, declineEvents] = await Promise.all([
        Transaction.countDocuments({
          merchant: account.merchant._id,
          idempotencyKey: decline.idempotencyKey,
        }),
        Settlement.countDocuments({ merchant: account.merchant._id }),
        Event.countDocuments({
          merchant: account.merchant._id,
          eventType: { $in: ["payment.created", "payment.failed"] },
        }),
        Event.countDocuments(declineEventFilter),
      ]);
      return { transactions, settlements, events, declineEvents };
    }

    const beforeReplay = await replayCounts();
    const replay = await request(
      baseUrl,
      key.secretKey,
      decline.idempotencyKey,
      decline.requestId,
      { amount: 1, currency: "USD", provider: EXTERNAL_PROVIDER_ID, scenario: "declined" }
    );
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.body, decline.response.body);
    const afterReplay = await replayCounts();
    assert.deepEqual(afterReplay, beforeReplay);
    console.log("Decline scenario passed");
    console.log("AuraPay persistence passed");
    console.log("No native leakage detected");

    activeScenario = "cleanup";
    cleanupAllowed = true;
    await ApiLog.deleteMany({ merchant: account.merchant._id });
    await IdempotencyKey.deleteMany({ merchant: account.merchant._id });
    await Event.deleteMany({ merchant: account.merchant._id });
    await Settlement.deleteMany({ merchant: account.merchant._id });
    await Transaction.deleteMany({ merchant: account.merchant._id });
    await ApiKey.deleteMany({ _id: key.apiKey._id, merchant: account.merchant._id });
    await User.deleteMany({ _id: account.owner._id, merchantId: account.merchant._id });
    await Merchant.deleteMany({ _id: account.merchant._id });
    console.log("Phase 11D smoke passed");
  } catch (error) {
    const suffix = fixture && !cleanupAllowed ? " Test-created evidence was preserved." : "";
    console.error(`Phase 11D smoke failed for safe run ${runId}, scenario ${activeScenario}.${suffix}`);
    if (error instanceof assert.AssertionError) throw error;
    throw new Error("Phase 11D halted without exposing provider, credential, or connection diagnostics.");
  } finally {
    await closeServer(server);
    await disconnectTestDatabase();
  }
}

main().catch((error) => {
  // Report only the harness-authored, sanitized error text. Never dump error
  // objects, stacks, request headers, environment variables, or provider data.
  console.error(error instanceof assert.AssertionError ? "Phase 11D assertion failed." : error.message);
  process.exitCode = 1;
});
