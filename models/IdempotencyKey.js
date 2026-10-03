const mongoose = require("mongoose");

const idempotencyKeySchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      index: true,
    },

    key: {
      type: String,
      required: true,
      trim: true,
    },

    endpoint: {
      type: String,
      required: true,
      trim: true,
    },

    requestHash: {
      type: String,
      required: true,
    },

    state: {
      type: String,
      enum: ["in_progress", "completed"],
      default: "completed",
      required: true,
      index: true,
    },

    providerIdempotencyKey: {
      type: String,
      default: null,
      trim: true,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    statusCode: {
      type: Number,
      required() {
        return (this.state || "completed") === "completed";
      },
    },

    responseBody: {
      type: Object,
      required() {
        return (this.state || "completed") === "completed";
      },
    },

    expiresAt: {
      type: Date,
      default: undefined,
      index: {
        expires: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

idempotencyKeySchema.index(
  {
    merchant: 1,
    endpoint: 1,
    key: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "IdempotencyKey",
  idempotencyKeySchema
);
