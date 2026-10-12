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
  },
  {
    timestamps: true,
    strict: "throw",
  }
);

providerWebhookEventSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true, name: "provider_event_unique" }
);

module.exports = mongoose.model("ProviderWebhookEvent", providerWebhookEventSchema);
