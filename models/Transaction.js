const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    // ======================================
    // RELATIONSHIPS
    // ======================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
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

    settlement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Settlement",
      default: null,
      index: true,
    },

    // ======================================
    // PAYMENT INFORMATION
    // ======================================

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    provider: {
      type: String,
      enum: ["Stripe", "PayPal", "Internal", "Test", "AuraPay Sandbox"],
      default: "Stripe",
      index: true,
    },

    paymentType: {
      type: String,
      enum: ["stripe", "paypal", "internal", "test"],
      default: "stripe",
    },

    environment: {
      type: String,
      enum: ["sandbox", "live"],
      default: "sandbox",
      index: true,
    },

    livemode: {
      type: Boolean,
      default: false,
      index: true,
    },

    sandboxScenario: {
      type: String,
      enum: ["success", "declined", "insufficient_funds", "pending", "failed", null],
      default: null,
      index: true,
    },

    idempotencyKey: {
      type: String,
      default: "",
      trim: true,
    },

    // ======================================
    // CUSTOMER
    // ======================================

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

    // ======================================
    // PROVIDER IDS
    // ======================================

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

    // ======================================
    // STATUS
    // ======================================

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
      index: true,
    },

    // ======================================
    // PERFORMANCE
    // ======================================

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

    rawProviderResponse: {
      type: Object,
      default: null,
    },

    // ======================================
    // ROUTING
    // ======================================

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

    // ======================================
    // FEES
    // ======================================

    estimatedFee: {
      type: Number,
      default: 0,
    },

    estimatedNet: {
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

    costScore: {
      type: String,
      default: "0.0",
    },

    // ======================================
    // SETTLEMENT
    // ======================================

    settled: {
      type: Boolean,
      default: false,
    },

    settledAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // REFUND
    // ======================================

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

    // ======================================
    // AUDIT
    // ======================================

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
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Transaction",
  transactionSchema
);
