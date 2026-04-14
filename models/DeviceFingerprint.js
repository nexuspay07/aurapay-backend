const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  ip: String,
  userAgent: String,
  deviceHash: String,

  lastSeen: { type: Date, default: Date.now },
  trustScore: { type: Number, default: 50 },

  isBlocked: { type: Boolean, default: false }
});

module.exports = mongoose.model("DeviceFingerprint", deviceSchema);