const mongoose = require("mongoose");

const apiLogSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      index: true,
    },

    apiKey: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApiKey",
      default: null,
      index: true,
    },

    endpoint: {
      type: String,
      required: true,
      trim: true,
    },

    method: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    status: {
      type: Number,
      required: true,
      index: true,
    },

    latencyMs: {
      type: Number,
      default: 0,
    },

    ip: {
      type: String,
      default: "",
      trim: true,
    },

    userAgent: {
      type: String,
      default: "",
      trim: true,
    },

    environment: {
      type: String,
      enum: ["sandbox", "live"],
      default: "sandbox",
      index: true,
    },

    requestId: {
      type: String,
      default: "",
      trim: true,
    },

    sanitizedRequest: {
      type: Object,
      default: {},
    },

    sanitizedResponse: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ApiLog", apiLogSchema);
