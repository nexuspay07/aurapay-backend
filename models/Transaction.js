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
    },
    status: {
      type: String,
      default: "completed",
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
    success: {
      type: Boolean,
      default: true,
    },
    paymentType: {
      type: String,
      default: "stripe",
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
      default: "manual",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);