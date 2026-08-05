const mongoose = require("mongoose");

const webhookDeliverySchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      index: true,
    },

    webhook: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MerchantWebhook",
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
      index: true,
    },

    statusCode: {
      type: Number,
      default: null,
    },

    latencyMs: {
      type: Number,
      default: 0,
    },

    errorMessage: {
      type: String,
      default: "",
    },

    attempts: {
      type: Number,
      default: 0,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    payloadPreview: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("WebhookDelivery", webhookDeliverySchema);
