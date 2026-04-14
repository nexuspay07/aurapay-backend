const mongoose = require("mongoose");

const blacklistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  reason: String,
  severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "LOW" },

}, { timestamps: true });

module.exports = mongoose.model("Blacklist", blacklistSchema);