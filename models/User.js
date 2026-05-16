const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: [
        "user",
        "super_admin",
        "finance_admin",
        "risk_admin",
        "support_admin",
        "auditor",
      ],
      default: "user",
      index: true,
    },

    permissions: {
      type: [String],
      default: [],
    },

    balance: {
      usd: {
        type: Number,
        default: 0,
      },

      eur: {
        type: Number,
        default: 0,
      },
    },

    status: {
      type: String,
      enum: [
        "unverified",
        "pending",
        "verified",
      ],
      default: "unverified",
      index: true,
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },

    frozen: {
      type: Boolean,
      default: false,
      index: true,
    },

    freezeUntil: {
      type: Date,
      default: null,
    },

    freezeReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "User",
  userSchema
);