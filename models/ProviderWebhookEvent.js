const mongoose = require("mongoose");

const providerWebhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ["stripe_external_sandbox"],
    },
    providerEventId: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ["payment_intent.succeeded", "payment_intent.payment_failed"],
    },
    providerObjectId: {
      type: String,
      required: true,
      trim: true,
    },
    payloadDigest: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    livemode: {
      type: Boolean,
      required: true,
      enum: [false],
    },
    status: {
      type: String,
      required: true,
      enum: ["processing", "recorded"],
    },
    outcomeCode: {
      type: String,
      required: true,
      enum: ["reservation_acquired", "event_recorded"],
    },
    processingOwner: {
      type: String,
      default: null,
      select: false,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
    attemptCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    lastAttemptAt: {
      type: Date,
      required: true,
    },
    recordedAt: {
      type: Date,
      default: null,
    },
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      default: null,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    amountMinor: {
      type: Number,
      min: 1,
      validate: (value) => value == null || Number.isSafeInteger(value),
      default: null,
    },
    currency: {
      type: String,
      lowercase: true,
      trim: true,
      match: /^[a-z]{3}$/,
      default: null,
    },
    processingVersion: {
      type: Number,
      min: 0,
      validate: (value) => value == null || Number.isSafeInteger(value),
      default: null,
    },
    financialStatus: {
      type: String,
      enum: ["pending", "processing", "processed", "failed"],
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    financialOutcomeCode: {
      type: String,
      trim: true,
      match: /^[a-z][a-z0-9_]{0,63}$/,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: "throw",
    autoIndex: false,
  }
);

providerWebhookEventSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true, name: "provider_event_unique" }
);

module.exports = mongoose.model("ProviderWebhookEvent", providerWebhookEventSchema);
