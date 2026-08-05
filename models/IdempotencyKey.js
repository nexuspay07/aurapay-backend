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

    statusCode: {
      type: Number,
      required: true,
    },

    responseBody: {
      type: Object,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
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
