const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true },
    password: String,

    balance: {
      usd: { type: Number, default: 0 },
      eur: { type: Number, default: 0 },
    },

    fraudCount: { type: Number, default: 0 },

    frozen: { type: Boolean, default: false },

    freezeUntil: { type: Date, default: null },

    preferredCurrency: { type: String, default: "usd" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);