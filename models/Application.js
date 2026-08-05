const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(

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

    description: {

      type: String,

      default: "",

    },

    website: {

      type: String,

      default: "",

    },

    logo: {

      type: String,

      default: "",

    },

    redirectUris: [

      {

        type: String,

      },

    ],

    allowedOrigins: [

      {

        type: String,

      },

    ],

    environment: {

      type: String,

      enum: [

        "sandbox",

        "live",

      ],

      default: "sandbox",

    },

    active: {

      type: Boolean,

      default: true,

    },

    lastUsedAt: {

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
    "Application",
    applicationSchema
  );
