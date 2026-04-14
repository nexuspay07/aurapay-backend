const mongoose = require("mongoose");

const systemConfigSchema = new mongoose.Schema({
  fraudBlockThreshold: { type: Number, default: 70 },
  fraudFlagThreshold: { type: Number, default: 40 },

  learningRate: { type: Number, default: 0.05 },

  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SystemConfig", systemConfigSchema);