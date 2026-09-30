const assert = require("node:assert/strict");
const test = require("node:test");

const {
  EmailConfigurationError,
  EmailDeliveryError,
  createEmailService,
  normalizePublicBaseUrl,
  shouldExposeDevelopmentLinks,
  validateDeliveryConfig,
} = require("../services/emailService");

const baseEnv = {
  NODE_ENV: "test",
  RESEND_API_KEY: "test-key-not-real",
  EMAIL_FROM: "AuraPay <mail@aurapay.test>",
  FRONTEND_URL: "http://localhost:5173/",
};

function serviceWith(send, env = baseEnv) {
  const records = [];
  return {
    records,
    service: createEmailService({
      env,
      clientFactory: () => ({ emails: { send } }),
      logger: {
        info(event, metadata) { records.push({ event, metadata }); },
        error(event, metadata) { records.push({ event, metadata }); },
      },
    }),
  };
}

test("accepts a successful Resend result and logs only safe metadata", async () => {
  const { service, records } = serviceWith(async () => ({ data: { id: "email-id" }, error: null }));
  assert.deepEqual(await service.sendEmail({ to: "person@example.com", subject: "Subject", html: "secret body", purpose: "verification" }), { id: "email-id" });
  assert.deepEqual(records, [{ event: "auth_email_delivery", metadata: { purpose: "verification", success: true } }]);
  assert.equal(JSON.stringify(records).includes("person@example.com"), false);
  assert.equal(JSON.stringify(records).includes("secret body"), false);
});

test("treats resolved Resend errors as sanitized delivery failures", async () => {
  const { service, records } = serviceWith(async () => ({ data: null, error: { message: "provider native secret" } }));
  await assert.rejects(service.sendEmail({ to: "person@example.com", subject: "Subject", html: "body", purpose: "verification" }), (error) => error instanceof EmailDeliveryError && error.code === "provider_rejected");
  assert.equal(JSON.stringify(records).includes("provider native secret"), false);
});

test("treats rejected provider requests as sanitized delivery failures", async () => {
  const { service } = serviceWith(async () => { throw new Error("network details"); });
  await assert.rejects(service.sendEmail({ to: "person@example.com", subject: "Subject", html: "body", purpose: "password_reset" }), (error) => error instanceof EmailDeliveryError && error.code === "provider_unavailable" && !error.message.includes("network details"));
});

test("delivery-disabled mode does not initialize a provider client", async () => {
  let initialized = false;
  const service = createEmailService({ env: { NODE_ENV: "test", EMAIL_DELIVERY_DISABLED: "true" }, clientFactory: () => { initialized = true; }, logger: { info() {} } });
  await assert.rejects(service.sendEmail({ purpose: "verification" }), EmailDeliveryError);
  assert.equal(initialized, false);
});

test("production configuration requires credentials, sender, and an HTTPS frontend URL", () => {
  assert.throws(() => validateDeliveryConfig({ NODE_ENV: "production", EMAIL_FROM: "mail@example.com", AURAPAY_FRONTEND_URL: "https://app.example.com" }), EmailConfigurationError);
  assert.throws(() => validateDeliveryConfig({ NODE_ENV: "production", RESEND_API_KEY: "key", EMAIL_FROM: "invalid", AURAPAY_FRONTEND_URL: "https://app.example.com" }), EmailConfigurationError);
  assert.throws(() => validateDeliveryConfig({ NODE_ENV: "production", RESEND_API_KEY: "key", EMAIL_FROM: "mail@example.com", AURAPAY_FRONTEND_URL: "http://app.example.com" }), /invalid/i);
});

test("frontend URL normalization is fixed configuration and strips trailing slashes", () => {
  assert.equal(normalizePublicBaseUrl({ NODE_ENV: "test", AURAPAY_FRONTEND_URL: "https://app.example.com/path///" }), "https://app.example.com/path");
  assert.throws(() => normalizePublicBaseUrl({ NODE_ENV: "production", AURAPAY_FRONTEND_URL: "https://user:pass@app.example.com" }), EmailConfigurationError);
  const { service } = serviceWith(async () => ({ data: { id: "unused" }, error: null }));
  assert.equal(service.buildPublicLink("/verify-email/token"), "http://localhost:5173/verify-email/token");
  assert.throws(() => service.buildPublicLink("https://attacker.example/token"), EmailConfigurationError);
});

test("production never exposes development email links", () => {
  assert.equal(shouldExposeDevelopmentLinks({ NODE_ENV: "test", AURAPAY_EXPOSE_TEST_EMAIL_LINKS: "true" }), true);
  assert.equal(shouldExposeDevelopmentLinks({ NODE_ENV: "production", AURAPAY_EXPOSE_TEST_EMAIL_LINKS: "true" }), false);
  assert.equal(shouldExposeDevelopmentLinks({ NODE_ENV: "development", AURAPAY_EXPOSE_TEST_EMAIL_LINKS: "false" }), false);
});
