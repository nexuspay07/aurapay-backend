const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      required: true,
      lowercase: true,
    },

    provider: {
      type: String,
      default: "Stripe",
    },

    transactionId: {
      type: String,
      default: null,
      index: true,
    },

    providerPaymentId: {
      type: String,
      default: null,
      index: true,
    },

    providerEventId: {
      type: String,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "provider_confirmed",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
      index: true,
    },

    success: {
      type: Boolean,
      default: false,
    },

    paymentType: {
      type: String,
      enum: ["stripe", "paypal", "internal", "test"],
      default: "test",
    },

    latency: {
      type: Number,
      default: 0,
    },

    attempts: {
      type: Number,
      default: 1,
    },

    errorMessage: {
      type: String,
      default: null,
    },

    recommendedProvider: {
      type: String,
      default: null,
    },

    attemptOrder: {
      type: [String],
      default: [],
    },

    selectionMode: {
      type: String,
      enum: ["manual", "auto"],
      default: "manual",
    },

    estimatedFee: {
      type: Number,
      default: 0,
    },

    estimatedNet: {
      type: Number,
      default: 0,
    },

    costScore: {
      type: String,
      default: "0.0",
    },

    platformFee: {
      type: Number,
      default: 0,
    },

    estimatedProfit: {
      type: Number,
      default: 0,
    },

    profitMargin: {
      type: Number,
      default: 0,
    },

    rawProviderResponse: {
      type: Object,
      default: null,
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);