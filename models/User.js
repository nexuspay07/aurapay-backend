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
    balance: {
      usd: { type: Number, default: 0 },
      eur: { type: Number, default: 0 },
    },

    // ✅ Phase 34.1
    status: {
      type: String,
      enum: ["unverified", "pending", "verified"],
      default: "unverified",
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);