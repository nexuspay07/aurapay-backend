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

        "merchant_owner",
        "merchant_staff",

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

    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      default: null,
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

    // =====================================
    // EMAIL VERIFICATION
    // =====================================

    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    emailVerificationToken: {
      type: String,
      default: null,
    },

    emailVerificationExpires: {
      type: Date,
      default: null,
    },

    // =====================================
    // PASSWORD RESET
    // =====================================

    passwordResetToken: {
      type: String,
      default: null,
    },

    passwordResetExpires: {
      type: Date,
      default: null,
    },

    // =====================================
    // SESSION MANAGEMENT
    // =====================================

    refreshToken: {
      type: String,
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    lastLoginIP: {
      type: String,
      default: null,
    },

    // =====================================
    // ACCOUNT SECURITY
    // =====================================

    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
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