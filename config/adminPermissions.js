const ADMIN_ROLES = Object.freeze([
  "super_admin", "finance_admin", "risk_admin", "support_admin", "auditor",
]);

const ALL_ADMIN_PERMISSIONS = Object.freeze([
  "user:view", "user:freeze",
  "merchant:view", "merchant:verify", "merchant:risk",
  "transaction:view", "transaction:refund",
  "settlement:view", "settlement:complete",
  "fraud:view", "audit:view", "analytics:view",
  "admin:view", "admin:create", "admin:update",
  "apikey:manage", "application:manage",
]);

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ALL_ADMIN_PERMISSIONS,
  finance_admin: ["merchant:view", "transaction:view", "transaction:refund", "settlement:view", "settlement:complete", "analytics:view"],
  risk_admin: ["user:view", "user:freeze", "merchant:view", "merchant:verify", "merchant:risk", "transaction:view", "fraud:view", "audit:view"],
  support_admin: ["user:view", "merchant:view", "transaction:view", "settlement:view"],
  auditor: ["user:view", "merchant:view", "transaction:view", "settlement:view", "fraud:view", "audit:view", "analytics:view", "admin:view"],
});

function effectivePermissions(user) {
  if (!user || !ADMIN_ROLES.includes(user.role)) return [];
  const defaults = ROLE_PERMISSIONS[user.role] || [];
  const explicit = Array.isArray(user.permissions) ? user.permissions : [];
  return [...new Set([...defaults, ...explicit])];
}

function hasPermission(user, required) {
  const requested = Array.isArray(required) ? required : [required];
  const available = effectivePermissions(user);
  return requested.some((item) => available.includes(item));
}

module.exports = { ADMIN_ROLES, ALL_ADMIN_PERMISSIONS, ROLE_PERMISSIONS, effectivePermissions, hasPermission };
