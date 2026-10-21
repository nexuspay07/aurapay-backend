const mongoose = require("mongoose");

const Event = require("../models/Event");
const ProviderWebhookEvent = require("../models/ProviderWebhookEvent");
const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const {
  assertProviderWebhookEventIndexReady,
} = require("./providerWebhookEventService");

const FINANCIAL_PROCESSING_FLAG = "STRIPE_WEBHOOK_FINANCIAL_PROCESSING_ENABLED";
const PROVIDER_EVENT_INDEX_NAME = "provider_event_unique";
const TRANSACTION_INDEX_NAME = "routing.selectedProvider_1_providerPaymentId_1";
const SETTLEMENT_INDEX_NAME = "settlement_transaction_unique";
const EVENT_INDEX_NAME = "event_lifecycle_deduplication_unique";

let financialReady = false;

class StripeWebhookFinancialReadinessError extends Error {
  constructor() {
    super("Stripe webhook financial processing is unavailable.");
    this.name = "StripeWebhookFinancialReadinessError";
  }
}

function isFinancialProcessingEnabled(env = process.env) {
  return env[FINANCIAL_PROCESSING_FLAG] === "true";
}

function sameKeys(actual, expected) {
  const actualEntries = Object.entries(actual || {});
  const expectedEntries = Object.entries(expected);
  return actualEntries.length === expectedEntries.length &&
    expectedEntries.every(([key, value], index) =>
      actualEntries[index]?.[0] === key && actualEntries[index]?.[1] === value
    );
}

function sameDocument(actual, expected) {
  if (!actual || typeof actual !== "object") return false;
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => {
    const expectedValue = expected[key];
    const actualValue = actual[key];
    if (expectedValue && typeof expectedValue === "object" && !Array.isArray(expectedValue)) {
      return sameDocument(actualValue, expectedValue);
    }
    return actualValue === expectedValue;
  });
}

function hasIndex(indexes, { name, keys, partialFilterExpression = null }) {
  return indexes.some((index) =>
    index?.name === name &&
    index?.unique === true &&
    index?.sparse !== true &&
    index?.hidden !== true &&
    sameKeys(index?.key, keys) &&
    (partialFilterExpression === null
      ? index?.partialFilterExpression == null
      : sameDocument(index?.partialFilterExpression, partialFilterExpression))
  );
}

function schemaDeclaresIndex(schema, expected) {
  return schema.indexes().some(([keys, options]) => hasIndex(
    [{ key: keys, ...options }],
    expected
  ));
}

async function listIndexes(model) {
  return model.collection.listIndexes().toArray();
}

function assertSchemaCompatibility(models) {
  const providerPaths = models.ProviderWebhookEvent.schema.paths;
  const expectedInstances = {
    amountMinor: "Number",
    currency: "String",
    processingVersion: "Number",
    financialStatus: "String",
    processedAt: "Date",
    financialOutcomeCode: "String",
  };
  for (const [path, instance] of Object.entries(expectedInstances)) {
    if (!providerPaths[path] ||
        providerPaths[path].isRequired === true ||
        providerPaths[path].instance !== instance) {
      throw new StripeWebhookFinancialReadinessError();
    }
  }

  if (!models.Event.schema.paths.deduplicationKey ||
      models.Event.schema.paths.deduplicationKey.isRequired === true ||
      models.Event.schema.paths.deduplicationKey.instance !== "String" ||
      models.Event.schema.paths.deduplicationKey.options.minlength !== 1) {
    throw new StripeWebhookFinancialReadinessError();
  }

  for (const model of Object.values(models)) {
    if (model.schema.options.autoIndex !== false) {
      throw new StripeWebhookFinancialReadinessError();
    }
  }


  const declarations = [
    [models.ProviderWebhookEvent.schema, {
      name: PROVIDER_EVENT_INDEX_NAME,
      keys: { provider: 1, providerEventId: 1 },
    }],
    [models.Transaction.schema, {
      name: TRANSACTION_INDEX_NAME,
      keys: { "routing.selectedProvider": 1, providerPaymentId: 1 },
      partialFilterExpression: {
        "routing.selectedProvider": "stripe_external_sandbox",
        providerPaymentId: { $type: "string" },
      },
    }],
    [models.Settlement.schema, {
      name: SETTLEMENT_INDEX_NAME,
      keys: { transaction: 1 },
    }],
    [models.Event.schema, {
      name: EVENT_INDEX_NAME,
      keys: { environment: 1, livemode: 1, deduplicationKey: 1 },
      partialFilterExpression: { deduplicationKey: { $type: "string" } },
    }],
  ];

  if (declarations.some(([schema, expected]) => !schemaDeclaresIndex(schema, expected))) {
    throw new StripeWebhookFinancialReadinessError();
  }
}

function supportsTransactions(hello) {
  const topologySupportsTransactions =
    typeof hello?.setName === "string" || hello?.msg === "isdbgrid";
  return topologySupportsTransactions &&
    hello?.logicalSessionTimeoutMinutes != null &&
    Number(hello?.maxWireVersion) >= 7;
}

async function verifyReadOnlyTransaction({ connection, SettlementModel }) {
  let session;
  let transactionStarted = false;
  let failure = null;

  try {
    session = await connection.startSession();
    session.startTransaction();
    transactionStarted = true;
    await SettlementModel.collection.findOne(
      {},
      { projection: { _id: 1 }, session }
    );
  } catch (error) {
    failure = error;
  }

  if (transactionStarted) {
    try {
      await session.abortTransaction();
    } catch (error) {
      failure ||= error;
    }
  }

  if (session) {
    try {
      await session.endSession();
    } catch (error) {
      failure ||= error;
    }
  }

  if (failure || !session || !transactionStarted) {
    throw new StripeWebhookFinancialReadinessError();
  }
}

async function findDuplicateSettlementGroups(SettlementModel) {
  return SettlementModel.aggregate([
    { $group: { _id: "$transaction", count: { $sum: 1 } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
}

async function initializeStripeWebhookFinancialReadiness({
  env = process.env,
  connection = mongoose.connection,
  models = { Event, ProviderWebhookEvent, Settlement, Transaction },
  assertReceptionReady = assertProviderWebhookEventIndexReady,
} = {}) {
  financialReady = false;

  try {
    if (!isFinancialProcessingEnabled(env)) {
      throw new StripeWebhookFinancialReadinessError();
    }

    assertReceptionReady();
    assertSchemaCompatibility(models);

    const [providerIndexes, transactionIndexes, settlementIndexes, eventIndexes] =
      await Promise.all([
        listIndexes(models.ProviderWebhookEvent),
        listIndexes(models.Transaction),
        listIndexes(models.Settlement),
        listIndexes(models.Event),
      ]);

    if (!hasIndex(providerIndexes, {
      name: PROVIDER_EVENT_INDEX_NAME,
      keys: { provider: 1, providerEventId: 1 },
    })) throw new StripeWebhookFinancialReadinessError();

    if (!hasIndex(transactionIndexes, {
      name: TRANSACTION_INDEX_NAME,
      keys: { "routing.selectedProvider": 1, providerPaymentId: 1 },
      partialFilterExpression: {
        "routing.selectedProvider": "stripe_external_sandbox",
        providerPaymentId: { $type: "string" },
      },
    })) throw new StripeWebhookFinancialReadinessError();

    if (!hasIndex(settlementIndexes, {
      name: SETTLEMENT_INDEX_NAME,
      keys: { transaction: 1 },
    })) throw new StripeWebhookFinancialReadinessError();

    if (!hasIndex(eventIndexes, {
      name: EVENT_INDEX_NAME,
      keys: { environment: 1, livemode: 1, deduplicationKey: 1 },
      partialFilterExpression: { deduplicationKey: { $type: "string" } },
    })) throw new StripeWebhookFinancialReadinessError();

    const hello = await connection.db.admin().command({ hello: 1 });
    if (!supportsTransactions(hello)) throw new StripeWebhookFinancialReadinessError();

    await verifyReadOnlyTransaction({
      connection,
      SettlementModel: models.Settlement,
    });

    const duplicates = await findDuplicateSettlementGroups(models.Settlement);
    if (!Array.isArray(duplicates) || duplicates.length !== 0) {
      throw new StripeWebhookFinancialReadinessError();
    }

    financialReady = true;
    return true;
  } catch {
    financialReady = false;
    throw new StripeWebhookFinancialReadinessError();
  }
}

function assertStripeWebhookFinancialReady() {
  if (!financialReady) throw new StripeWebhookFinancialReadinessError();
}

function isStripeWebhookFinancialReady() {
  return financialReady;
}

module.exports = {
  EVENT_INDEX_NAME,
  FINANCIAL_PROCESSING_FLAG,
  PROVIDER_EVENT_INDEX_NAME,
  SETTLEMENT_INDEX_NAME,
  TRANSACTION_INDEX_NAME,
  StripeWebhookFinancialReadinessError,
  assertSchemaCompatibility,
  assertStripeWebhookFinancialReady,
  findDuplicateSettlementGroups,
  hasIndex,
  initializeStripeWebhookFinancialReadiness,
  isFinancialProcessingEnabled,
  isStripeWebhookFinancialReady,
  schemaDeclaresIndex,
  supportsTransactions,
  verifyReadOnlyTransaction,
};
