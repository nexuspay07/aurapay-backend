const mongoose = require("mongoose");

const userRiskProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },

  avgAmount: { type: Number, default: 0 },
  totalTransactions: { type: Number, default: 0 },

  preferredCurrency: { type: String, default: "usd" },

  transactionsLastMinute: { type: Number, default: 0 },
  lastTransactionTime: { type: Date },

  fraudCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("UserRiskProfile", userRiskProfileSchema);