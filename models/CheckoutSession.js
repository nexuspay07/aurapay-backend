const mongoose = require("mongoose");

const checkoutSessionSchema =
  new mongoose.Schema(
    {
      merchant: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Merchant",
      },

      sessionId: {
        type: String,
        required: true,
        unique: true,
      },

      amount: {
        type: Number,
        required: true,
      },

      currency: {
        type: String,
        default: "USD",
      },

      customerEmail: {
        type: String,
        default: "",
      },

      status: {
        type: String,
        enum: [
          "created",
          "pending",
          "paid",
          "failed",
          "expired",
        ],
        default: "created",
      },

      provider: {
        type: String,
        default: "AuraPay",
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "CheckoutSession",
    checkoutSessionSchema
  );