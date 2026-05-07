const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ["Stripe", "PayPal"],
      index: true,
    },

    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["processing", "processed", "failed"],
      default: "processing",
      index: true,
    },

    providerPaymentId: {
      type: String,
      default: null,
      index: true,
    },

    errorMessage: {
      type: String,
      default: null,
    },

    rawEvent: {
      type: Object,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);