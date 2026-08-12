const assert = require("node:assert/strict");
const test = require("node:test");
const { ALL_ADMIN_PERMISSIONS, effectivePermissions, hasPermission } = require("../config/adminPermissions");
const createAuditLog = require("../utils/createAuditLog");
const AuditLog = require("../models/AuditLog");

test("legacy super_admin with empty explicit permissions has full access", () => {
  const user = { role: "super_admin", permissions: [] };
  assert.deepEqual(effectivePermissions(user), ALL_ADMIN_PERMISSIONS);
  assert.equal(hasPermission(user, "settlement:complete"), true);
  assert.equal(hasPermission(user, "admin:create"), true);
});

test("admin roles receive role-appropriate access", () => {
  assert.equal(hasPermission({ role: "finance_admin" }, "settlement:complete"), true);
  assert.equal(hasPermission({ role: "risk_admin" }, "merchant:verify"), true);
  assert.equal(hasPermission({ role: "support_admin" }, "settlement:complete"), false);
  assert.equal(hasPermission({ role: "auditor" }, "audit:view"), true);
  assert.equal(hasPermission({ role: "auditor" }, "user:freeze"), false);
});

test("explicit permissions remain supported without granting unrelated scope", () => {
  const support = { role: "support_admin", permissions: ["fraud:view"] };
  assert.equal(hasPermission(support, "fraud:view"), true);
  assert.equal(hasPermission(support, "admin:update"), false);
});

test("audit helper strips secret-bearing metadata", async () => {
  const original = AuditLog.create;
  let recorded;
  AuditLog.create = async (value) => { recorded = value; };
  try {
    await createAuditLog({ admin: "507f1f77bcf86cd799439011", action: "test", metadata: { password: "bad", token: "bad", safe: "ok", nested: { webhookSecret: "bad", reason: "ok" } } });
    assert.deepEqual(recorded.metadata, { safe: "ok", nested: { reason: "ok" } });
  } finally { AuditLog.create = original; }
});
