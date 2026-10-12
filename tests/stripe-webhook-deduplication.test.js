const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const Stripe = require("stripe");

const { installExternalNetworkTripwire } = require("../config/testNetworkIsolation");
const ProviderWebhookEvent = require("../models/ProviderWebhookEvent");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const Event = require("../models/Event");
const {
  LEASE_MILLISECONDS,
  PROVIDER,
  ProviderWebhookActiveLeaseError,
  ProviderWebhookPersistenceError,
  initializeProviderWebhookEventIndex,
  markWebhookEventRecorded,
  reserveVerifiedWebhookEvent,
} = require("../services/providerWebhookEventService");
const {
  assertSafeDestructiveOperation,
  connectTestDatabase,
  disconnectTestDatabase,
} = require("./helpers/testDatabase");

installExternalNetworkTripwire();

const TEST_SECRET = "whsec_phase12ctestsecret1234567890";
const ENDPOINT = "/api/provider-webhooks/stripe/test";
const originalEnvironment = {
  enabled: process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED,
  secret: process.env.STRIPE_TEST_WEBHOOK_SECRET,
};

process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED = "true";
process.env.STRIPE_TEST_WEBHOOK_SECRET = TEST_SECRET;

const app = require("../app");

let server;
let baseUrl;

function fixture(id, overrides = {}) {
  return {
    id,
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    data: {
      object: {
        id: `pi_${id.slice(4)}`,
        object: "payment_intent",
        livemode: false,
        amount: 100,
        currency: "usd",
        status: "succeeded",
        ...overrides,
      },
    },
  };
}

function signed(payload) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET });
}

async function postEvent(value) {
  const payload = JSON.stringify(value);
  const response = await fetch(`${baseUrl}${ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": signed(payload),
    },
    body: payload,
  });
  return { status: response.status, body: await response.json() };
}

function safeDocument(id, overrides = {}) {
  const now = new Date();
  return {
    provider: PROVIDER,
    providerEventId: id,
    eventType: "payment_intent.succeeded",
    providerObjectId: `pi_${id.slice(4)}`,
    payloadDigest: "a".repeat(64),
    livemode: false,
    status: "processing",
    outcomeCode: "reservation_acquired",
    processingOwner: "test-owner",
    leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
    attemptCount: 1,
    lastAttemptAt: now,
    ...overrides,
  };
}

test.before(async () => {
  await connectTestDatabase();
  await initializeProviderWebhookEventIndex();
  assertSafeDestructiveOperation();
  await ProviderWebhookEvent.deleteMany({
    provider: PROVIDER,
    providerEventId: /^evt_phase12c_test/,
  });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assertSafeDestructiveOperation();
  await ProviderWebhookEvent.deleteMany({
    provider: PROVIDER,
    providerEventId: /^evt_phase12c_test/,
  });
  await disconnectTestDatabase();
  if (originalEnvironment.enabled === undefined) delete process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED;
  else process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED = originalEnvironment.enabled;
  if (originalEnvironment.secret === undefined) delete process.env.STRIPE_TEST_WEBHOOK_SECRET;
  else process.env.STRIPE_TEST_WEBHOOK_SECRET = originalEnvironment.secret;
});

test("twenty simultaneous identical deliveries create exactly one durable reservation", async () => {
  const value = fixture("evt_phase12c_test_concurrent");
  const responses = await Promise.all(Array.from({ length: 20 }, () => postEvent(value)));
  assert.equal(responses.filter((response) => response.status === 200 && response.body.data.duplicate === false).length, 1);
  assert.ok(responses.every((response) =>
    response.status === 200 ||
    (response.status === 409 && response.body.error.code === "webhook_in_progress")
  ), JSON.stringify(responses));

  const records = await ProviderWebhookEvent.find({
    provider: PROVIDER,
    providerEventId: value.id,
  }).lean();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "recorded");
  assert.equal(records[0].attemptCount, 1);

  const replay = await postEvent(value);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.duplicate, true);
});

test("webhook persistence fails closed until the exact unique index is verified", async () => {
  const originalInit = ProviderWebhookEvent.init;
  const originalListIndexes = ProviderWebhookEvent.collection.listIndexes;

  ProviderWebhookEvent.init = async () => { throw new Error("simulated index initialization failure"); };
  try {
    await assert.rejects(initializeProviderWebhookEventIndex(), ProviderWebhookPersistenceError);
    const unavailable = await postEvent(fixture("evt_phase12c_test_index_unavailable"));
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.error.code, "webhook_persistence_unavailable");
    assert.equal(await ProviderWebhookEvent.countDocuments({
      provider: PROVIDER,
      providerEventId: "evt_phase12c_test_index_unavailable",
    }), 0);
  } finally {
    ProviderWebhookEvent.init = originalInit;
  }

  ProviderWebhookEvent.collection.listIndexes = () => ({
    toArray: async () => [{
      name: "provider_event_unique",
      key: { provider: 1, providerEventId: 1 },
      unique: false,
    }],
  });
  try {
    await assert.rejects(initializeProviderWebhookEventIndex(), ProviderWebhookPersistenceError);
  } finally {
    ProviderWebhookEvent.collection.listIndexes = originalListIndexes;
  }

  assert.equal(await initializeProviderWebhookEventIndex(), true);
  const ready = await postEvent(fixture("evt_phase12c_test_index_ready"));
  assert.equal(ready.status, 200);
  assert.equal(ready.body.data.persisted, true);
});

test("active leases block ownership", async () => {
  const activeValue = fixture("evt_phase12c_test_active");
  const activePayload = Buffer.from(JSON.stringify(activeValue));
  const digest = require("node:crypto").createHash("sha256").update(activePayload).digest("hex");
  await ProviderWebhookEvent.create(safeDocument(activeValue.id, { payloadDigest: digest }));
  await assert.rejects(
    reserveVerifiedWebhookEvent({
      event: { id: activeValue.id, type: activeValue.type, livemode: false, providerObjectId: activeValue.data.object.id },
      rawBody: activePayload,
    }),
    ProviderWebhookActiveLeaseError
  );

});

test("twenty concurrent expired-lease reclamations produce one fenced owner", async () => {
  const expiredValue = fixture("evt_phase12c_test_expired");
  const expiredPayload = Buffer.from(JSON.stringify(expiredValue));
  const expiredDigest = require("node:crypto").createHash("sha256").update(expiredPayload).digest("hex");
  await ProviderWebhookEvent.create(safeDocument(expiredValue.id, {
    payloadDigest: expiredDigest,
    leaseExpiresAt: new Date(Date.now() - 1000),
  }));
  const attempts = await Promise.allSettled(Array.from({ length: 20 }, () =>
    reserveVerifiedWebhookEvent({
      event: { id: expiredValue.id, type: expiredValue.type, livemode: false, providerObjectId: expiredValue.data.object.id },
      rawBody: expiredPayload,
    })
  ));
  const owners = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(owners.length, 1);
  assert.equal(rejected.length, 19);
  assert.ok(rejected.every((attempt) => attempt.reason instanceof ProviderWebhookActiveLeaseError));
  assert.equal(owners[0].value.disposition, "owned");
  assert.notEqual(owners[0].value.processingOwner, "test-owner");

  const records = await ProviderWebhookEvent.find({ provider: PROVIDER, providerEventId: expiredValue.id })
    .select("+processingOwner")
    .lean();
  assert.equal(records.length, 1);
  assert.equal(records[0].attemptCount, 2);
  assert.equal(records[0].processingOwner, owners[0].value.processingOwner);

  await assert.rejects(
    markWebhookEventRecorded({ reservationId: records[0]._id, processingOwner: "test-owner" }),
    ProviderWebhookPersistenceError
  );
  const unchanged = await ProviderWebhookEvent.findById(records[0]._id).select("+processingOwner").lean();
  assert.equal(unchanged.status, "processing");
  assert.equal(unchanged.processingOwner, owners[0].value.processingOwner);
});

test("database failures are retryable and do not receive a successful acknowledgement", async () => {
  const originalCreate = ProviderWebhookEvent.create;
  ProviderWebhookEvent.create = async () => { throw new Error("simulated database outage"); };
  try {
    const response = await postEvent(fixture("evt_phase12c_test_database_failure"));
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "webhook_persistence_unavailable");
  } finally {
    ProviderWebhookEvent.create = originalCreate;
  }
});

test("a changed payload conflicts and cannot replace a recorded event", async () => {
  const original = fixture("evt_phase12c_test_conflict");
  assert.equal((await postEvent(original)).status, 200);
  const changed = fixture(original.id, { amount: 200 });
  const response = await postEvent(changed);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "webhook_event_conflict");
  assert.equal(await ProviderWebhookEvent.countDocuments({
    provider: PROVIDER,
    providerEventId: original.id,
  }), 1);
});

test("finalization failure remains leased and cannot be acknowledged or immediately retried", async () => {
  const value = fixture("evt_phase12c_test_finalization_failure");
  const originalFindOneAndUpdate = ProviderWebhookEvent.findOneAndUpdate;
  ProviderWebhookEvent.findOneAndUpdate = async () => null;
  try {
    const response = await postEvent(value);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "webhook_persistence_unavailable");
  } finally {
    ProviderWebhookEvent.findOneAndUpdate = originalFindOneAndUpdate;
  }

  const blockedReplay = await postEvent(value);
  assert.equal(blockedReplay.status, 409);
  assert.equal(blockedReplay.body.error.code, "webhook_in_progress");
  const stored = await ProviderWebhookEvent.findOne({ provider: PROVIDER, providerEventId: value.id }).lean();
  assert.equal(stored.status, "processing");
  assert.ok(stored.leaseExpiresAt > new Date());
});

test("only sanitized data is stored and financial state remains unchanged", async () => {
  const value = fixture("evt_phase12c_test_quarantine", {
    client_secret: "must-not-persist",
    payment_method: { card: { number: "4242424242424242" } },
    metadata: { merchant: "attacker-selected-tenant" },
  });
  const financialCounts = async () => {
    const transactions = await Transaction.find({
      $or: [
        { providerEventId: value.id },
        { providerPaymentId: value.data.object.id },
      ],
    }).select("_id").lean();
    const transactionIds = transactions.map((transaction) => transaction._id);
    return Promise.all([
      Promise.resolve(transactions.length),
      Settlement.countDocuments({ transaction: { $in: transactionIds } }),
      Event.countDocuments({
        $or: [
          { resourceId: { $in: transactionIds } },
          { "payload.providerEventId": value.id },
          { "payload.providerPaymentId": value.data.object.id },
        ],
      }),
    ]);
  };
  const before = await financialCounts();
  assert.equal((await postEvent(value)).status, 200);
  const after = await financialCounts();
  assert.deepEqual(after, before);

  const stored = await ProviderWebhookEvent.findOne({ provider: PROVIDER, providerEventId: value.id }).lean();
  assert.equal(stored.merchant, null);
  assert.equal(stored.transaction, null);
  assert.equal(stored.payloadDigest.length, 64);
  const serialized = JSON.stringify(stored);
  assert.equal(serialized.includes("must-not-persist"), false);
  assert.equal(serialized.includes("4242424242424242"), false);
  assert.equal(serialized.includes("attacker-selected-tenant"), false);
  assert.equal(serialized.includes(TEST_SECRET), false);
});
