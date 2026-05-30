const mongoose = require("mongoose");

const checkoutSchema =
  new mongoose.Schema(
    {
      merchantId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Merchant",
        required: true,
      },

      title: {
        type: String,
        required: true,
      },

      description: {
        type: String,
        default: "",
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
          "active",
          "inactive",
        ],
        default: "active",
      },

      slug: {
        type: String,
        unique: true,
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "Checkout",
    checkoutSchema
  );