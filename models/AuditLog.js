const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    action: {
      type: String,
      required: true,
    },

    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },

    metadata: {
      type: Object,
      default: {},
    },

    ipAddress: String,

    userAgent: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);