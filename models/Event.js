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

    deduplicationKey: {

      type: String,

      trim: true,

      minlength: 1,

      default: null,

    },

  },

  {

    timestamps: true,

    autoIndex: false,

  }

);

eventSchema.index(
  { environment: 1, livemode: 1, deduplicationKey: 1 },
  {
    unique: true,
    name: "event_lifecycle_deduplication_unique",
    partialFilterExpression: { deduplicationKey: { $type: "string" } },
  }
);

module.exports =
  mongoose.model(
    "Event",
    eventSchema
  );
