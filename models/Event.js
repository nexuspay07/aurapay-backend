const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(

  {

    eventType: {

      type: String,

      required: true,

    },

    resourceType: {

      type: String,

      required: true,

    },

    resourceId: {

      type: mongoose.Schema.Types.ObjectId,

      required: true,

    },

    merchant: {

      type: mongoose.Schema.Types.ObjectId,

      ref: "Merchant",

      default: null,

    },

    payload: {

      type: Object,

      default: {},

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

    },

    delivered: {

      type: Boolean,

      default: false,

    },

    deliveredAt: {

      type: Date,

      default: null,

    },

    // Delivery tracking

    deliveryAttempts: {

      type: Number,

      default: 0,

    },

    lastDeliveryAttempt: {

      type: Date,

      default: null,

    },

    lastError: {

      type: String,

      default: null,

    },

  },

  {

    timestamps: true,

  }

);

module.exports =
  mongoose.model(
    "Event",
    eventSchema
  );
