const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const readinessPath = path.resolve(
  __dirname,
  "../services/stripeWebhookFinancialReadinessService.js"
);
require("../app");
const appImportLoadedReadiness = Boolean(require.cache[readinessPath]);

const Event = require("../models/Event");
const ProviderWebhookEvent = require("../models/ProviderWebhookEvent");
const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const {
  StripeWebhookFinancialReadinessError,
  assertStripeWebhookFinancialReady,
  initializeStripeWebhookFinancialReadiness,
  isFinancialProcessingEnabled,
  isStripeWebhookFinancialReady,
} = require("../services/stripeWebhookFinancialReadinessService");

const providerIndex = {
  name: "provider_event_unique",
  key: { provider: 1, providerEventId: 1 },
  unique: true,
};
const transactionIndex = {
  name: "routing.selectedProvider_1_providerPaymentId_1",
  key: { "routing.selectedProvider": 1, providerPaymentId: 1 },
  unique: true,
  partialFilterExpression: {
    "routing.selectedProvider": "stripe_external_sandbox",
    providerPaymentId: { $type: "string" },
  },
};
const settlementIndex = {
  name: "settlement_transaction_unique",
  key: { transaction: 1 },
  unique: true,
};
const eventIndex = {
  name: "event_lifecycle_deduplication_unique",
  key: { environment: 1, livemode: 1, deduplicationKey: 1 },
  unique: true,
  partialFilterExpression: { deduplicationKey: { $type: "string" } },
};

function modelDouble(model, indexes, { duplicates = [], calls, transactionFailure } = {}) {
  return {
    schema: model.schema,
    collection: {
      listIndexes() {
        return { toArray: async () => indexes };
      },
      async findOne(filter, options) {
        calls.transactionRead += 1;
        assert.deepEqual(filter, {});
        assert.deepEqual(options.projection, { _id: 1 });
        assert.ok(options.session);
        if (["read", "permission"].includes(transactionFailure)) {
          throw new Error("simulated read failure");
        }
        return null;
      },
    },
    async aggregate(pipeline) {
      calls.duplicatePipeline = pipeline;
      return duplicates;
    },
  };
}

function dependencies({
  providerIndexes = [providerIndex],
  transactionIndexes = [transactionIndex],
  settlementIndexes = [settlementIndex],
  eventIndexes = [eventIndex],
  duplicates = [],
  hello = {
    setName: "test-rs",
    logicalSessionTimeoutMinutes: 30,
    maxWireVersion: 21,
  },
  assertReceptionReady = () => {},
  transactionFailure = null,
} = {}) {
  const calls = {
    abort: 0,
    duplicatePipeline: null,
    end: 0,
    hello: 0,
    reception: 0,
    start: 0,
    transactionRead: 0,
  };
  const modelOptions = { calls, transactionFailure };
  return {
    calls,
    options: {
      env: { STRIPE_WEBHOOK_FINANCIAL_PROCESSING_ENABLED: "true" },
      assertReceptionReady() {
        calls.reception += 1;
        return assertReceptionReady();
      },
      connection: {
        async startSession() {
          if (transactionFailure === "session") throw new Error("simulated session failure");
          return {
            startTransaction() {
              calls.start += 1;
              if (transactionFailure === "start") throw new Error("simulated transaction failure");
            },
            async abortTransaction() {
              calls.abort += 1;
              if (transactionFailure === "abort") throw new Error("simulated abort failure");
            },
            async endSession() {
              calls.end += 1;
              if (transactionFailure === "cleanup") throw new Error("simulated cleanup failure");
            },
          };
        },
        db: {
          admin() {
            return {
              async command(command) {
                calls.hello += 1;
                assert.deepEqual(command, { hello: 1 });
                return hello;
              },
            };
          },
        },
      },
      models: {
        Event: modelDouble(Event, eventIndexes, modelOptions),
        ProviderWebhookEvent: modelDouble(ProviderWebhookEvent, providerIndexes, modelOptions),
        Settlement: modelDouble(Settlement, settlementIndexes, { ...modelOptions, duplicates }),
        Transaction: modelDouble(Transaction, transactionIndexes, modelOptions),
      },
    },
  };
}

test("financial processing flag accepts only the exact string true", () => {
  assert.equal(isFinancialProcessingEnabled({}), false);
  assert.equal(isFinancialProcessingEnabled({ STRIPE_WEBHOOK_FINANCIAL_PROCESSING_ENABLED: "false" }), false);
  assert.equal(isFinancialProcessingEnabled({ STRIPE_WEBHOOK_FINANCIAL_PROCESSING_ENABLED: "TRUE" }), false);
  assert.equal(isFinancialProcessingEnabled({ STRIPE_WEBHOOK_FINANCIAL_PROCESSING_ENABLED: "1" }), false);
  assert.equal(isFinancialProcessingEnabled({ STRIPE_WEBHOOK_FINANCIAL_PROCESSING_ENABLED: true }), false);
  assert.equal(isFinancialProcessingEnabled({ STRIPE_WEBHOOK_FINANCIAL_PROCESSING_ENABLED: "true" }), true);
});

test("disabled readiness fails before database or reception checks", async () => {
  const fixture = dependencies();
  fixture.options.env = {};
  await assert.rejects(
    initializeStripeWebhookFinancialReadiness(fixture.options),
    StripeWebhookFinancialReadinessError
  );
  assert.equal(fixture.calls.reception, 0);
  assert.equal(fixture.calls.hello, 0);
  assert.equal(isStripeWebhookFinancialReady(), false);
});

test("missing, incorrect, and non-unique indexes fail closed", async (t) => {
  const cases = [
    ["missing provider index", { providerIndexes: [] }],
    ["wrong provider index name", {
      providerIndexes: [{ ...providerIndex, name: "unexpected_name" }],
    }],
    ["incorrect transaction partial filter", {
      transactionIndexes: [{ ...transactionIndex, partialFilterExpression: { providerPaymentId: { $type: "string" } } }],
    }],
    ["non-unique settlement index", {
      settlementIndexes: [{ ...settlementIndex, unique: false }],
    }],
    ["wrong settlement index name", {
      settlementIndexes: [{ ...settlementIndex, name: "transaction_1" }],
    }],
    ["partial provider index", {
      providerIndexes: [{ ...providerIndex, partialFilterExpression: { provider: { $type: "string" } } }],
    }],
    ["sparse provider index", {
      providerIndexes: [{ ...providerIndex, sparse: true }],
    }],
    ["partial settlement index", {
      settlementIndexes: [{ ...settlementIndex, partialFilterExpression: { transaction: { $type: "objectId" } } }],
    }],
    ["sparse settlement index", {
      settlementIndexes: [{ ...settlementIndex, sparse: true }],
    }],
    ["wrong transaction index name", {
      transactionIndexes: [{ ...transactionIndex, name: "unexpected_name" }],
    }],
    ["sparse transaction index", {
      transactionIndexes: [{ ...transactionIndex, sparse: true }],
    }],
    ["sparse event index", {
      eventIndexes: [{ ...eventIndex, sparse: true }],
    }],
    ["wrong event index name", {
      eventIndexes: [{ ...eventIndex, name: "unexpected_name" }],
    }],
    ["incorrect event key order", {
      eventIndexes: [{ ...eventIndex, key: { deduplicationKey: 1, environment: 1, livemode: 1 } }],
    }],
  ];

  for (const [name, overrides] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        initializeStripeWebhookFinancialReadiness(dependencies(overrides).options),
        StripeWebhookFinancialReadinessError
      );
      assert.equal(isStripeWebhookFinancialReady(), false);
    });
  }
});

test("standalone and sessionless deployments fail transaction capability verification", async () => {
  for (const hello of [
    { logicalSessionTimeoutMinutes: 30, maxWireVersion: 21 },
    { setName: "test-rs", maxWireVersion: 21 },
    { setName: "test-rs", logicalSessionTimeoutMinutes: 30, maxWireVersion: 6 },
  ]) {
    await assert.rejects(
      initializeStripeWebhookFinancialReadiness(dependencies({ hello }).options),
      StripeWebhookFinancialReadinessError
    );
  }
});

test("read-only transaction failures fail readiness and still clean up", async (t) => {
  for (const failure of ["session", "start", "read", "permission", "abort", "cleanup"]) {
    await t.test(failure, async () => {
      const fixture = dependencies({ transactionFailure: failure });
      await assert.rejects(
        initializeStripeWebhookFinancialReadiness(fixture.options),
        StripeWebhookFinancialReadinessError
      );
      assert.equal(isStripeWebhookFinancialReady(), false);
      if (["read", "permission"].includes(failure)) {
        assert.equal(fixture.calls.abort, 1);
        assert.equal(fixture.calls.end, 1);
      }
      if (failure === "abort") assert.equal(fixture.calls.end, 1);
    });
  }
});

test("duplicate settlement transaction groups fail readiness", async () => {
  await assert.rejects(
    initializeStripeWebhookFinancialReadiness(
      dependencies({ duplicates: [{ _id: "redacted", count: 2 }] }).options
    ),
    StripeWebhookFinancialReadinessError
  );
  assert.equal(isStripeWebhookFinancialReady(), false);
});

test("successful readiness verifies reception, metadata, topology, and duplicates", async () => {
  const fixture = dependencies();
  assert.equal(await initializeStripeWebhookFinancialReadiness(fixture.options), true);
  assert.equal(fixture.calls.reception, 1);
  assert.equal(fixture.calls.hello, 1);
  assert.equal(fixture.calls.start, 1);
  assert.equal(fixture.calls.transactionRead, 1);
  assert.equal(fixture.calls.abort, 1);
  assert.equal(fixture.calls.end, 1);
  assert.equal(isStripeWebhookFinancialReady(), true);
  assert.doesNotThrow(assertStripeWebhookFinancialReady);
});

test("financial failure remains separate from reception readiness", async () => {
  let receptionReady = true;
  const fixture = dependencies({ settlementIndexes: [] });
  fixture.options.assertReceptionReady = () => {
    fixture.calls.reception += 1;
    assert.equal(receptionReady, true);
  };
  await assert.rejects(
    initializeStripeWebhookFinancialReadiness(fixture.options),
    StripeWebhookFinancialReadinessError
  );
  assert.equal(receptionReady, true);
  assert.equal(isStripeWebhookFinancialReady(), false);
});

test("direct app import does not initialize financial readiness", () => {
  assert.equal(appImportLoadedReadiness, false);
});

test("readiness declarations disable automatic index creation", () => {
  for (const model of [Event, ProviderWebhookEvent, Settlement, Transaction]) {
    assert.equal(model.schema.options.autoIndex, false);
  }
});

test("Phase 12D.1 webhook fields remain optional and validate sanitized values", async () => {
  const legacy = new ProviderWebhookEvent({
    provider: "stripe_external_sandbox",
    providerEventId: "evt_legacy",
    eventType: "payment_intent.succeeded",
    providerObjectId: "pi_legacy",
    payloadDigest: "a".repeat(64),
    livemode: false,
    status: "recorded",
    outcomeCode: "event_recorded",
    lastAttemptAt: new Date(),
  });
  await assert.doesNotReject(legacy.validate());

  const extended = new ProviderWebhookEvent({
    ...legacy.toObject(),
    _id: undefined,
    amountMinor: 1250,
    currency: "USD",
    processingVersion: 0,
    financialStatus: "pending",
    financialOutcomeCode: "awaiting_processing",
  });
  await assert.doesNotReject(extended.validate());
  assert.equal(extended.currency, "usd");

  extended.amountMinor = 1.5;
  await assert.rejects(extended.validate(), /amountMinor/);
});

test("Event rejects blank lifecycle deduplication keys", async () => {
  const event = new Event({
    eventType: "payment.completed",
    resourceType: "transaction",
    resourceId: new (require("mongoose").Types.ObjectId)(),
    deduplicationKey: "   ",
  });
  await assert.rejects(event.validate(), /deduplicationKey/);
});

test("duplicate Settlement audit uses the exact bounded pipeline", async () => {
  const fixture = dependencies();
  await initializeStripeWebhookFinancialReadiness(fixture.options);
  assert.deepEqual(fixture.calls.duplicatePipeline, [
    { $group: { _id: "$transaction", count: { $sum: 1 } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
});

test("readiness performs no financial writes", async () => {
  const fixture = dependencies();
  for (const model of Object.values(fixture.options.models)) {
    model.create = () => assert.fail("create must not be called");
    model.updateOne = () => assert.fail("updateOne must not be called");
    model.findOneAndUpdate = () => assert.fail("findOneAndUpdate must not be called");
    model.deleteMany = () => assert.fail("deleteMany must not be called");
  }
  assert.equal(await initializeStripeWebhookFinancialReadiness(fixture.options), true);
});
