const mongoose = require("mongoose");

const merchantWebhookSchema = new mongoose.Schema(

  {

    merchant: {

      type: mongoose.Schema.Types.ObjectId,

      ref: "Merchant",

      required: true,

    },

    url: {

      type: String,

      required: true,

      trim: true,

    },

    secret: {

      type: String,

      required: true,

    },

    eventTypes: [

      {

        type: String,

      }

    ],

    active: {

      type: Boolean,

      default: true,

    },

    lastDeliveryAt: {

      type: Date,

      default: null,

    },

    lastDeliveryStatus: {

      type: String,

      enum: [

        "pending",

        "delivered",

        "failed",

        null,

      ],

      default: null,

    },

  },

  {

    timestamps: true,

  }

);

module.exports =
  mongoose.model(
    "MerchantWebhook",
    merchantWebhookSchema
  );
