const mongoose = require("mongoose");

const settlementSchema =
  new mongoose.Schema(
    {
      merchant: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Merchant",
      },

      amount: {
        type: Number,
        required: true,
      },

      currency: {
        type: String,
        default: "USD",
      },

      status: {
        type: String,
        enum: [
          "pending",
          "processing",
          "completed",
          "failed",
        ],
        default: "pending",
      },

      transactionCount: {
        type: Number,
        default: 0,
      },

      processedAt: {
        type: Date,
        default: null,
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