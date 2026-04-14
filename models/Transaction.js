const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: Number,
  currency: String,
  provider: String,
  transactionId: String,
  status: String,
  latency: Number,
  attempts: Number,
  errorMessage: String,
  success: Boolean,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", transactionSchema);