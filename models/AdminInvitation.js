const mongoose = require("mongoose");

const adminInvitationSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  role: { type: String, required: true },
  permissions: { type: [String], default: [] },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending", index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

adminInvitationSchema.index({ email: 1, status: 1 });
module.exports = mongoose.model("AdminInvitation", adminInvitationSchema);
