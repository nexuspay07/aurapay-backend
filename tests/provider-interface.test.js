const assert = require("node:assert/strict");
const test = require("node:test");

const { InvalidProviderResultError, assertPaymentProvider, normalizeProviderResult } = require("../services/providers/providerContract");
const { ProviderRegistry, UnsupportedProviderError } = require("../services/providers/providerRegistry");
const { sandboxPaymentProvider } = require("../services/providers/sandboxPaymentProvider");

test("payment provider contract requires an id and executePayment operation", () => {
  assert.throws(() => assertPaymentProvider({ id: "missing-operation" }), /executePayment/);
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
