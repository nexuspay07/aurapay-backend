const mongoose = require("mongoose");

const fraudLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: Number,
  currency: String,
  riskScore: Number,
  decision: String, // APPROVE / FLAG / BLOCK
  reasons: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("FraudLog", fraudLogSchema);