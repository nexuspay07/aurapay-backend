const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    merchant: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Merchant",
  required: true,
  index: true,
},

checkoutSession: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "CheckoutSession",
  default: null,
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
    },

    customerName: {
  type: String,
  default: "",
  trim: true,
},

customerEmail: {
  type: String,
  default: "",
  lowercase: true,
  trim: true,
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

    merchantFee: {
  type: Number,
  default: 0,
},

merchantNet: {
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

    settlement: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Settlement",
  default: null,
},

settled: {
  type: Boolean,
  default: false,
},

settledAt: {
  type: Date,
  default: null,
},

    failedAt: {
      type: Date,
      default: null,
    },

    refund: {
  providerRefundId: {
    type: String,
    default: null,
    index: true,
  },

  providerRefundStatus: {
    type: String,
    default: null,
  },

  refundAmount: {
    type: Number,
    default: 0,
  },

  refundCurrency: {
    type: String,
    default: null,
    lowercase: true,
  },

  refundReason: {
    type: String,
    default: "requested_by_user",
  },

  refundRequestedAt: {
    type: Date,
    default: null,
  },

  refundCompletedAt: {
    type: Date,
    default: null,
  },
},

    refundedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);