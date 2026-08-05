const mongoose = require("mongoose");

const apiKeySchema = new mongoose.Schema(

  {

    merchant: {

      type: mongoose.Schema.Types.ObjectId,

      ref: "Merchant",

      required: true,

      index: true,

    },

    name: {

      type: String,

      required: true,

      trim: true,

    },

    publicKey: {

      type: String,

      required: true,

      unique: true,

      index: true,

    },

    secretKeyPrefix: {

  type: String,

  required: true,

  index: true,

},

    secretKeyHash: {

      type: String,

      required: true,

    },

    environment: {

      type: String,

      enum: [

        "sandbox",

        "live",

      ],

      default: "sandbox",

    },

    permissions: [

      {

        type: String,

      }

    ],

    active: {

      type: Boolean,

      default: true,

    },

    lastUsedAt: {

      type: Date,

      default: null,

    },

    expiresAt: {

      type: Date,

      default: null,

    },

  },

  {

    timestamps: true,

  }

);

module.exports =
  mongoose.model(
    "ApiKey",
    apiKeySchema
  );