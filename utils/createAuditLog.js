const AuditLog = require("../models/AuditLog");

const SENSITIVE = /password|token|secret|authorization|api[-_]?key/i;
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE.test(key)).map(([key, item]) => [key, sanitize(item)]));
}

async function createAuditLog({
  admin,
  actorEmail = null,
  action,
  targetType = null,
  targetId = null,
  targetLabel = null,
  severity = "low",
  metadata = {},
  req = null,
}) {
  try {
    await AuditLog.create({
      admin,
      action,
      actorEmail,
      targetType,
      targetId: targetId ? String(targetId) : null,
      targetLabel,
      severity,
      metadata: sanitize(metadata),

      requestId: req?.headers?.["x-request-id"] || null,

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
