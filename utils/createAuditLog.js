const AuditLog = require("../models/AuditLog");

async function createAuditLog({
  admin,
  action,
  targetUser = null,
  transaction = null,
  metadata = {},
  req = null,
}) {
  try {
    await AuditLog.create({
      admin,
      action,
      targetUser,
      transaction,
      metadata,

      ipAddress:
        req?.headers["x-forwarded-for"] ||
        req?.socket?.remoteAddress ||
        null,

      userAgent: req?.headers["user-agent"] || null,
    });
  } catch (err) {
    console.error("Audit log creation failed:", err.message);
  }
}

module.exports = createAuditLog;