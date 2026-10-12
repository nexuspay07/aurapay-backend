const crypto = require("node:crypto");

const ProviderWebhookEvent = require("../models/ProviderWebhookEvent");

const PROVIDER = "stripe_external_sandbox";
const LEASE_MILLISECONDS = 60 * 1000;
const REQUIRED_INDEX_NAME = "provider_event_unique";

let indexReady = false;

class ProviderWebhookPersistenceError extends Error {
  constructor(message = "Webhook event persistence failed.") {
    super(message);
    this.name = "ProviderWebhookPersistenceError";
  }
}

class ProviderWebhookActiveLeaseError extends Error {
  constructor() {
    super("Webhook event is already being recorded.");
    this.name = "ProviderWebhookActiveLeaseError";
  }
}

class ProviderWebhookConflictError extends Error {
  constructor() {
    super("Provider event identity conflicts with prior content.");
    this.name = "ProviderWebhookConflictError";
  }
}

function isRequiredUniqueIndex(index) {
  const keys = index?.key;
  return index?.name === REQUIRED_INDEX_NAME &&
    index?.unique === true &&
    keys &&
    Object.keys(keys).length === 2 &&
    keys.provider === 1 &&
    keys.providerEventId === 1;
}

async function initializeProviderWebhookEventIndex() {
  indexReady = false;
  try {
    await ProviderWebhookEvent.init();
    const indexes = await ProviderWebhookEvent.collection.listIndexes().toArray();
    if (!indexes.some(isRequiredUniqueIndex)) throw new Error("Required unique index is unavailable.");
    indexReady = true;
    return true;
  } catch {
    throw new ProviderWebhookPersistenceError();
  }
}

function assertProviderWebhookEventIndexReady() {
  if (!indexReady) throw new ProviderWebhookPersistenceError();
}

function digestPayload(rawBody) {
  if (!Buffer.isBuffer(rawBody)) throw new ProviderWebhookPersistenceError();
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

function safeIdentityMatches(document, event, payloadDigest) {
  return document.payloadDigest === payloadDigest &&
    document.eventType === event.type &&
    document.providerObjectId === event.providerObjectId &&
    document.livemode === false;
}

async function reserveVerifiedWebhookEvent({ event, rawBody, now = new Date() }) {
  assertProviderWebhookEventIndexReady();
  const payloadDigest = digestPayload(rawBody);
  const processingOwner = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MILLISECONDS);

  try {
    const reservation = await ProviderWebhookEvent.create({
      provider: PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      providerObjectId: event.providerObjectId,
      payloadDigest,
      livemode: false,
      status: "processing",
      outcomeCode: "reservation_acquired",
      processingOwner,
      leaseExpiresAt,
      attemptCount: 1,
      lastAttemptAt: now,
    });
    return { disposition: "owned", reservation, processingOwner, payloadDigest };
  } catch (error) {
    if (error?.code !== 11000) throw new ProviderWebhookPersistenceError();
  }

  let existing;
  try {
    existing = await ProviderWebhookEvent.findOne({
      provider: PROVIDER,
      providerEventId: event.id,
    }).select("+processingOwner");
  } catch {
    throw new ProviderWebhookPersistenceError();
  }

  if (!existing) throw new ProviderWebhookPersistenceError();
  if (!safeIdentityMatches(existing, event, payloadDigest)) {
    throw new ProviderWebhookConflictError();
  }
  if (existing.status === "recorded") {
    return { disposition: "duplicate", reservation: existing };
  }

  try {
    const reclaimed = await ProviderWebhookEvent.findOneAndUpdate(
      {
        _id: existing._id,
        provider: PROVIDER,
        providerEventId: event.id,
        payloadDigest,
        status: "processing",
        leaseExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: "processing",
          outcomeCode: "reservation_acquired",
          processingOwner,
          leaseExpiresAt,
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
      { returnDocument: "after", runValidators: true }
    ).select("+processingOwner");

    if (reclaimed) {
      return { disposition: "owned", reservation: reclaimed, processingOwner, payloadDigest };
    }
  } catch {
    throw new ProviderWebhookPersistenceError();
  }

  throw new ProviderWebhookActiveLeaseError();
}

async function markWebhookEventRecorded({ reservationId, processingOwner, now = new Date() }) {
  let recorded;
  try {
    recorded = await ProviderWebhookEvent.findOneAndUpdate(
      {
        _id: reservationId,
        status: "processing",
        processingOwner,
      },
      {
        $set: {
          status: "recorded",
          outcomeCode: "event_recorded",
          recordedAt: now,
          processingOwner: null,
          leaseExpiresAt: null,
        },
      },
      { returnDocument: "after", runValidators: true }
    );
  } catch {
    throw new ProviderWebhookPersistenceError();
  }

  if (!recorded) throw new ProviderWebhookPersistenceError();
  return recorded;
}

async function persistVerifiedWebhookEvent({ event, rawBody, now = new Date() }) {
  const reservation = await reserveVerifiedWebhookEvent({ event, rawBody, now });
  if (reservation.disposition === "duplicate") return reservation;

  await markWebhookEventRecorded({
    reservationId: reservation.reservation._id,
    processingOwner: reservation.processingOwner,
    now,
  });
  return { ...reservation, disposition: "recorded" };
}

module.exports = {
  LEASE_MILLISECONDS,
  PROVIDER,
  ProviderWebhookActiveLeaseError,
  ProviderWebhookConflictError,
  ProviderWebhookPersistenceError,
  assertProviderWebhookEventIndexReady,
  digestPayload,
  initializeProviderWebhookEventIndex,
  isRequiredUniqueIndex,
  markWebhookEventRecorded,
  persistVerifiedWebhookEvent,
  reserveVerifiedWebhookEvent,
};
