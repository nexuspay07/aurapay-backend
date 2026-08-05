const mongoose = require("mongoose");

const settlementSchema =
  new mongoose.Schema(
    {
      // ======================================
      // MERCHANT
      // ======================================

      merchant: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Merchant",
        required: true,
        index: true,
      },

      // ======================================
      // SOURCE TRANSACTION
      // ======================================

      transaction: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
        required: true,
        index: true,
      },

      // ======================================
      // SETTLEMENT DETAILS
      // ======================================

      amount: {
        type: Number,
        required: true,
      },

      netAmount: {
        type: Number,
        required: true,
      },

      currency: {
        type: String,
        required: true,
        lowercase: true,
      },

      transactionCount: {
        type: Number,
        default: 1,
      },

      payout: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payout",
    default: null,
},

paidAt: {
    type: Date,
    default: null,
},

      // ======================================
      // STATUS
      // ======================================

      status: {
        type: String,
        enum: [
          "pending",
          "processing",
          "completed",
          "failed",
          "refunded"
        ],
        default: "pending",
        index: true,
      },

      settlementDate: {
        type: Date,
        default: null,
      },

      processedAt: {
        type: Date,
        default: null,
      },

      refundAmount: {
    type: Number,
    default: 0,
},

refundCount: {
    type: Number,
    default: 0,
},

outstandingAmount: {
    type: Number,
    default: function () {
        return this.netAmount;
    },
},

      notes: {
        type: String,
        default: "",
      },

    },
    {
      timestamps: true,
    }
  );

  

module.exports =
  mongoose.model(
    "Settlement",
    settlementSchema
  );