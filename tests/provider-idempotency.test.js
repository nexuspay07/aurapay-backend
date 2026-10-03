const assert = require("node:assert/strict");
const test = require("node:test");

const { deriveProviderIdempotencyKey } = require("../services/providerIdempotencyService");

test("provider idempotency derivation is stable, isolated, and opaque", () => {
  const previous = process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET;
  const secret = "provider-idempotency-unit-test-secret";
  process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET = secret;

  try {
    const base = {
      merchantId: "merchant-123",
      endpoint: "POST /api/v1/payments",
      idempotencyKey: "developer-key@example.test",
    };
    const first = deriveProviderIdempotencyKey(base);
    assert.equal(first, deriveProviderIdempotencyKey(base));
    assert.match(first, /^ap_pay_v1_[A-Za-z0-9_-]{43}$/);
    assert.ok(first.length <= 255);
    assert.notEqual(deriveProviderIdempotencyKey({ ...base, merchantId: "merchant-456" }), first);
    assert.notEqual(deriveProviderIdempotencyKey({ ...base, endpoint: "POST /api/v1/refunds" }), first);
    assert.notEqual(deriveProviderIdempotencyKey({ ...base, idempotencyKey: "different-key" }), first);
    assert.equal(first.includes(base.idempotencyKey), false);
    assert.equal(first.includes(base.merchantId), false);
    assert.equal(first.includes("example.test"), false);
    assert.equal(first.includes(secret), false);
  } finally {
    if (previous === undefined) delete process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET;
    else process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET = previous;
  }
});

test("provider idempotency derivation fails closed without its dedicated secret", () => {
  const previous = process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET;
  delete process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET;
  try {
    assert.throws(
      () => deriveProviderIdempotencyKey({
        merchantId: "merchant-123",
        endpoint: "POST /api/v1/payments",
        idempotencyKey: "developer-key",
      }),
      /not configured/
    );
  } finally {
    if (previous !== undefined) process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET = previous;
  }
});
