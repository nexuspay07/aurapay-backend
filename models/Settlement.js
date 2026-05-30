const mongoose = require("mongoose");

const settlementSchema =
  new mongoose.Schema(
    {
      merchantId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Merchant",
        required: true,
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

      settlementDate: {
        type: Date,
        default: null,
      },

      reference: {
        type: String,
        default: "",
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