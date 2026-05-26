const mongoose = require("mongoose");

const auditLogSchema =
  new mongoose.Schema(
    {
      admin: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "User",
      },

      action: {
        type: String,
        required: true,
      },

      targetType: {
        type: String,
        default: null,
      },

      targetId: {
        type: String,
        default: null,
      },

      metadata: {
        type: Object,
        default: {},
      },

      ipAddress: {
        type: String,
        default: null,
      },

      severity: {
        type: String,
        enum: [
          "low",
          "medium",
          "high",
          "critical",
        ],
        default: "low",
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "AuditLog",
    auditLogSchema
  );