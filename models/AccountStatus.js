const mongoose = require("mongoose");

const accountStatusSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  isFrozen: { type: Boolean, default: false },
  freezeReason: { type: String, default: null },

  freezeUntil: { type: Date, default: null },

  lastTransactionTime: { type: Date },
  transactionCountWindow: { type: Number, default: 0 },

}, { timestamps: true });

module.exports = mongoose.model("AccountStatus", accountStatusSchema);