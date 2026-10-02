const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { assertSafeDestructiveOperation, connectTestDatabase, disconnectTestDatabase } = require("./helpers/testDatabase");
const emailService = require("../services/emailService");
const app = require("../app");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

const genericMessage = "If an eligible account exists, reset instructions have been sent.";
const originalDelivery = emailService.sendAdminPasswordResetEmail;
const originalBuildPublicLink = emailService.buildPublicLink;
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  AURAPAY_EXPOSE_TEST_EMAIL_LINKS: process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS,
};
let server, baseUrl, admin;

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  await connectTestDatabase();
  admin = await User.create({ email: `admin-local-reset-${Date.now()}@aurapay.test`, password: await bcrypt.hash("OriginalAdmin123!", 4), role: "super_admin", status: "verified", emailVerified: true });
  server = http.createServer(app); await new Promise((resolve) => server.listen(0, resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  emailService.sendAdminPasswordResetEmail = originalDelivery;
  emailService.buildPublicLink = originalBuildPublicLink;
  if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.AURAPAY_EXPOSE_TEST_EMAIL_LINKS === undefined) delete process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS; else process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS = originalEnv.AURAPAY_EXPOSE_TEST_EMAIL_LINKS;
  assertSafeDestructiveOperation(); await AuditLog.deleteMany({ admin: admin._id }); await User.deleteOne({ _id: admin._id });
  if (server?.listening) await new Promise((resolve) => server.close(resolve)); await disconnectTestDatabase();
});

test("admin forgot-password exposes only a guarded failed-delivery link and preserves reset security", async () => {
  const rawTokens = [];
  process.env.NODE_ENV = "test";
  process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS = "true";
  emailService.sendAdminPasswordResetEmail = async () => { throw new Error("simulated delivery failure"); };

  const startedAt = Date.now();
  const exposed = await request("/admin-auth/forgot-password", { email: admin.email });
  assert.equal(exposed.status, 200); assert.equal(exposed.body.data.message, genericMessage); assert.ok(exposed.body.data.developmentResetLink);
  const url = new URL(exposed.body.data.developmentResetLink); assert.match(url.pathname, /^\/admin-reset-password\/[a-f0-9]{64}$/);
  const token = url.pathname.split("/").pop(); rawTokens.push(token);
  const stored = await User.findById(admin._id).select("+passwordResetToken");
  assert.notEqual(stored.passwordResetToken, token); assert.equal(stored.passwordResetToken, crypto.createHash("sha256").update(token).digest("hex"));
  const expiryMs = stored.passwordResetExpires.getTime() - startedAt; assert.ok(expiryMs >= 3_590_000 && expiryMs <= 3_610_000, `unexpected expiry: ${expiryMs}`);

  const firstReset = await request(`/admin-auth/reset-password/${token}`, { password: "UpdatedAdmin123!" }); assert.equal(firstReset.status, 200);
  const secondReset = await request(`/admin-auth/reset-password/${token}`, { password: "AnotherAdmin123!" }); assert.equal(secondReset.status, 400);

  const unknown = await request("/admin-auth/forgot-password", { email: `missing-${Date.now()}@aurapay.test` });
  assert.deepEqual(unknown.body, { success: true, data: { message: genericMessage } });
  const invalid = await request("/admin-auth/forgot-password", { email: "not-an-email" });
  assert.deepEqual(invalid.body, { success: true, data: { message: genericMessage } });

  process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS = "false";
  const disabled = await request("/admin-auth/forgot-password", { email: admin.email });
  assert.deepEqual(disabled.body, { success: true, data: { message: genericMessage } });

  process.env.NODE_ENV = "production"; process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS = "true";
  const production = await request("/admin-auth/forgot-password", { email: admin.email });
  assert.deepEqual(production.body, { success: true, data: { message: genericMessage } });

  process.env.NODE_ENV = "test";
  emailService.buildPublicLink = () => { throw new Error("simulated link construction failure"); };
  const linkFailure = await request("/admin-auth/forgot-password", { email: admin.email });
  assert.deepEqual(linkFailure.body, { success: true, data: { message: genericMessage } });
  emailService.buildPublicLink = originalBuildPublicLink;

  emailService.sendAdminPasswordResetEmail = async (_user, deliveredToken) => { rawTokens.push(deliveredToken); return { id: "simulated-delivery" }; };
  const delivered = await request("/admin-auth/forgot-password", { email: admin.email });
  assert.deepEqual(delivered.body, { success: true, data: { message: genericMessage } });

  const audits = await AuditLog.find({ admin: admin._id, action: { $in: ["admin.password.reset.requested", "admin.password.reset.completed"] } }).lean();
  assert.ok(audits.length >= 2); const serializedAudits = JSON.stringify(audits);
  for (const rawToken of rawTokens) assert.equal(serializedAudits.includes(rawToken), false);
});
