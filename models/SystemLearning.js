const mongoose = require("mongoose");

const systemLearningSchema = new mongoose.Schema({
  fraudAccuracy: { type: Number, default: 1 }, // how correct decisions are
  falsePositives: { type: Number, default: 0 },
  falseNegatives: { type: Number, default: 0 },

  totalTransactions: { type: Number, default: 0 },

  fraudSensitivity: { type: Number, default: 1 }, // adjusts scoring
  routingConfidence: { type: Number, default: 1 },

  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SystemLearning", systemLearningSchema);