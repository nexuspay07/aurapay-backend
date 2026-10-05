const assert = require("node:assert/strict");
const test = require("node:test");

const { InvalidProviderResultError, assertPaymentProvider, normalizeProviderResult } = require("../services/providers/providerContract");
const {
  ProviderRegistry,
  UnsupportedProviderError,
  providerRegistry,
} = require("../services/providers/providerRegistry");
const { sandboxPaymentProvider } = require("../services/providers/sandboxPaymentProvider");
const { stripeSandboxPaymentProvider } = require("../services/providers/stripeSandboxPaymentProvider");
const { paypalSandboxPaymentProvider } = require("../services/providers/paypalSandboxPaymentProvider");

test("payment provider contract requires an id and executePayment operation", () => {
  assert.throws(() => assertPaymentProvider({ id: "missing-operation" }), /executePayment/);
  assert.throws(
    () => assertPaymentProvider({ id: "invalid-preflight", executePayment() {}, validatePaymentRequest: true }),
    /validatePaymentRequest/
  );
  assert.equal(assertPaymentProvider(sandboxPaymentProvider), sandboxPaymentProvider);
});

test("sandbox adapter returns normalized results for every supported lifecycle outcome", async () => {
  const expected = {
    success: ["completed", true, "payment_completed"],
    declined: ["failed", false, "card_declined"],
    insufficient_funds: ["failed", false, "insufficient_funds"],
    pending: ["pending", false, "payment_processing"],
  };

  for (const [scenario, [status, success, code]] of Object.entries(expected)) {
    const raw = await sandboxPaymentProvider.executePayment({ amount: 12.345, currency: "cad", scenario });
    const result = normalizeProviderResult(raw);
    assert.equal(result.provider, "aurapay_sandbox");
    assert.match(result.providerPaymentId, /^pay_test_[a-f0-9]{20}$/);
    assert.equal(result.status, status);
    assert.equal(result.success, success);
    assert.equal(result.outcome.code, code);
    assert.equal(result.amount, 12.35);
    assert.equal(result.currency, "CAD");
    assert.equal(result.environment, "sandbox");
    assert.equal(result.livemode, false);
    assert.deepEqual(result.metadata, { scenario });
    assert.equal("rawProviderResponse" in result, false);
  }
});

test("provider normalization rejects malformed or live-capable results", () => {
  const valid = {
    provider: "test", providerPaymentId: "pay_test_1", status: "completed", success: true,
    outcome: { code: "payment_completed", message: "Completed." }, amount: 10, currency: "USD",
    environment: "sandbox", livemode: false,
    metadata: { scenario: "success", credential: "must-not-cross-boundary" },
    providerNativePayload: { arbitrary: true },
  };
  assert.deepEqual(normalizeProviderResult(valid).metadata, { scenario: "success" });
  assert.equal("providerNativePayload" in normalizeProviderResult(valid), false);
  assert.throws(() => normalizeProviderResult({ ...valid, status: "unknown" }), InvalidProviderResultError);
  assert.throws(() => normalizeProviderResult({ ...valid, success: false }), /success must match/);
  assert.throws(() => normalizeProviderResult({ ...valid, environment: "live", livemode: true }), /sandbox results only/);
  assert.throws(() => normalizeProviderResult({ ...valid, outcome: {} }), /outcome code and message/);
});

test("registry resolves only explicitly registered providers", () => {
  const registry = new ProviderRegistry([sandboxPaymentProvider]);
  assert.equal(registry.resolve("aurapay_sandbox"), sandboxPaymentProvider);
  assert.throws(() => registry.resolve("stripe"), UnsupportedProviderError);
  assert.throws(() => registry.resolve("paypal"), UnsupportedProviderError);
});

test("Stripe sandbox adapter satisfies the normalized sandbox provider contract", async () => {
  assert.equal(assertPaymentProvider(stripeSandboxPaymentProvider), stripeSandboxPaymentProvider);

  const raw = await stripeSandboxPaymentProvider.executePayment({
    amount: 25.55,
    currency: "cad",
    scenario: "success",
  });

  const result = normalizeProviderResult(raw);

  assert.equal(result.provider, "stripe_sandbox");
  assert.match(result.providerPaymentId, /^pay_stripe_test_[a-f0-9]{20}$/);
  assert.equal(result.status, "completed");
  assert.equal(result.success, true);
  assert.equal(result.outcome.code, "payment_completed");
  assert.equal(result.amount, 25.55);
  assert.equal(result.currency, "CAD");
  assert.equal(result.environment, "sandbox");
  assert.equal(result.livemode, false);
  assert.deepEqual(result.metadata, { scenario: "success" });
});

test("PayPal sandbox adapter satisfies the normalized sandbox provider contract", async () => {
  assert.equal(assertPaymentProvider(paypalSandboxPaymentProvider), paypalSandboxPaymentProvider);

  const raw = await paypalSandboxPaymentProvider.executePayment({
    amount: 25.55,
    currency: "cad",
    scenario: "success",
  });

  const result = normalizeProviderResult(raw);

  assert.equal(result.provider, "paypal_sandbox");
  assert.match(result.providerPaymentId, /^pay_paypal_test_[a-f0-9]{20}$/);
  assert.equal(result.status, "completed");
  assert.equal(result.success, true);
  assert.equal(result.outcome.code, "payment_completed");
  assert.equal(result.amount, 25.55);
  assert.equal(result.currency, "CAD");
  assert.equal(result.environment, "sandbox");
  assert.equal(result.livemode, false);
  assert.deepEqual(result.metadata, { scenario: "success" });
});

test("Phase 8 registry exposes only approved sandbox payment providers", () => {
  const aurapay = providerRegistry.resolve("aurapay_sandbox");
  const stripeSandbox = providerRegistry.resolve("stripe_sandbox");
  const paypalSandbox = providerRegistry.resolve("paypal_sandbox");

  assert.equal(aurapay.id, "aurapay_sandbox");
  assert.equal(stripeSandbox.id, "stripe_sandbox");
  assert.equal(paypalSandbox.id, "paypal_sandbox");

  assert.throws(() => providerRegistry.resolve("stripe"), UnsupportedProviderError);
  assert.throws(() => providerRegistry.resolve("paypal"), UnsupportedProviderError);
  assert.throws(() => providerRegistry.resolve("unknown"), UnsupportedProviderError);
});
