const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "debit",
        "credit",
        "fee",
        "refund",
        "reversal",
      ],
      required: true,
      index: true,
    },

    account: {
      type: String,
      enum: [
        "wallet",
        "provider_settlement",
        "platform_revenue",
        "refund_pool",
      ],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
    },

    provider: {
      type: String,
      default: null,
    },

    balanceBefore: {
      type: Number,
      default: 0,
    },

    balanceAfter: {
      type: Number,
      default: 0,
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);