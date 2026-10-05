const assert = require("node:assert/strict");
const test = require("node:test");

const Transaction = require("../models/Transaction");
const { normalizeProviderResult } = require("../services/providers/providerContract");
const { configuredAdapters } = require("../services/providers/providerRegistry");
const {
  DEFAULT_TIMEOUT_MS,
  STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
  StripeExternalSandboxConfigurationError,
  StripeExternalSandboxResponseError,
  StripeExternalSandboxUncertainError,
  TEST_PAYMENT_METHODS,
  createStripeExternalSandboxPaymentProvider,
  createStripeExternalSandboxPaymentProviderFromEnvironment,
  isStripeExternalSandboxEnabled,
  readStripeExternalSandboxConfig,
  validatePaymentRequest,
} = require("../services/providers/stripeExternalSandboxPaymentProvider");

const VALID_TEST_KEY = `sk_test_${"a".repeat(24)}`;
const PROVIDER_KEY = `ap_pay_v1_${"b".repeat(43)}`;

function paymentIntent(overrides = {}) {
  return {
    object: "payment_intent",
    id: "pi_test_123",
    livemode: false,
    amount: 1234,
    currency: "usd",
    status: "succeeded",
    client_secret: "must_not_escape",
    payment_method: { card: { last4: "4242" } },
    lastResponse: { requestId: "must_not_escape" },
    ...overrides,
  };
}

function fakeClient(implementation) {
  const calls = [];
  return {
    calls,
    client: {
      paymentIntents: {
        async create(params, options) {
          calls.push({ params, options });
          return implementation(params, options);
        },
      },
    },
  };
}

function adapterWith(implementation, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const fake = fakeClient(implementation);
  return {
    fake,
    adapter: createStripeExternalSandboxPaymentProvider({
      stripeClient: fake.client,
      timeoutMs,
    }),
  };
}

function request(overrides = {}) {
  return {
    amount: 12.34,
    currency: "USD",
    scenario: "success",
    providerIdempotencyKey: PROVIDER_KEY,
    requestId: "req_aurapay_only",
    ...overrides,
  };
}

test("external Stripe sandbox is enabled only by exact true", () => {
  assert.equal(isStripeExternalSandboxEnabled({}), false);
  assert.equal(isStripeExternalSandboxEnabled({ STRIPE_EXTERNAL_SANDBOX_ENABLED: "false" }), false);
  assert.equal(isStripeExternalSandboxEnabled({ STRIPE_EXTERNAL_SANDBOX_ENABLED: "TRUE" }), false);
  assert.equal(isStripeExternalSandboxEnabled({ STRIPE_EXTERNAL_SANDBOX_ENABLED: "1" }), false);
  assert.equal(isStripeExternalSandboxEnabled({ STRIPE_EXTERNAL_SANDBOX_ENABLED: "true" }), true);
});

test("registry includes the external adapter only when explicitly enabled", () => {
  const disabledIds = configuredAdapters({
    STRIPE_EXTERNAL_SANDBOX_ENABLED: "false",
    STRIPE_TEST_SECRET_KEY: VALID_TEST_KEY,
  }).map(({ id }) => id);
  assert.deepEqual(disabledIds, ["aurapay_sandbox", "stripe_sandbox", "paypal_sandbox"]);

  const enabledIds = configuredAdapters({
    STRIPE_EXTERNAL_SANDBOX_ENABLED: "true",
    STRIPE_TEST_SECRET_KEY: VALID_TEST_KEY,
  }).map(({ id }) => id);
  assert.deepEqual(enabledIds, [
    "aurapay_sandbox",
    "stripe_sandbox",
    "paypal_sandbox",
    STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
  ]);
});

test("provider payment ID uniqueness is scoped only to the external adapter", () => {
  const matchingIndex = Transaction.schema.indexes().find(([fields]) => (
    fields["routing.selectedProvider"] === 1 && fields.providerPaymentId === 1
  ));
  assert.ok(matchingIndex);
  assert.equal(matchingIndex[1].unique, true);
  assert.deepEqual(matchingIndex[1].partialFilterExpression, {
    "routing.selectedProvider": STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
    providerPaymentId: { $type: "string" },
  });
});

test("configuration rejects missing, live, publishable, restricted, and malformed credentials", () => {
  const invalidKeys = [undefined, "", "sk_live_secret", "pk_test_public", "rk_test_restricted", "not-a-key"];
  for (const key of invalidKeys) {
    assert.throws(
      () => readStripeExternalSandboxConfig({
        STRIPE_EXTERNAL_SANDBOX_ENABLED: "true",
        STRIPE_TEST_SECRET_KEY: key,
      }),
      StripeExternalSandboxConfigurationError
    );
  }
});

test("configuration validates timeout before constructing a Stripe client", () => {
  for (const timeout of ["999", "30001", "1.5", "invalid", "-1"]) {
    let constructions = 0;
    assert.throws(
      () => createStripeExternalSandboxPaymentProviderFromEnvironment({
        env: {
          STRIPE_EXTERNAL_SANDBOX_ENABLED: "true",
          STRIPE_TEST_SECRET_KEY: VALID_TEST_KEY,
          STRIPE_EXTERNAL_TIMEOUT_MS: timeout,
        },
        stripeFactory() {
          constructions += 1;
          return fakeClient(() => paymentIntent()).client;
        },
      }),
      StripeExternalSandboxConfigurationError
    );
    assert.equal(constructions, 0);
  }
});

test("valid environment constructs a retry-disabled client without exposing its key", () => {
  const factoryCalls = [];
  const provider = createStripeExternalSandboxPaymentProviderFromEnvironment({
    env: {
      STRIPE_EXTERNAL_SANDBOX_ENABLED: "true",
      STRIPE_TEST_SECRET_KEY: VALID_TEST_KEY,
      STRIPE_EXTERNAL_TIMEOUT_MS: "12000",
    },
    stripeFactory(secretKey, options) {
      factoryCalls.push({ secretKey, options });
      return fakeClient(() => paymentIntent()).client;
    },
  });

  assert.equal(provider.id, STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
  assert.deepEqual(factoryCalls, [{
    secretKey: VALID_TEST_KEY,
    options: { timeout: 12000, maxNetworkRetries: 0, telemetry: false },
  }]);
  assert.equal(JSON.stringify(provider).includes(VALID_TEST_KEY), false);
});

test("preflight validates supported currency, exact minor units, amount range, and scenarios without network", () => {
  const accepted = [
    { amount: 0.5, currency: "USD", scenario: "success", minorAmount: 50 },
    { amount: 0.51, currency: "CAD", scenario: "success", minorAmount: 51 },
    { amount: 1, currency: "USD", scenario: "success", minorAmount: 100 },
    { amount: 1.2, currency: "USD", scenario: "success", minorAmount: 120 },
    { amount: 10.29, currency: "USD", scenario: "success", minorAmount: 1029 },
    { amount: 999.99, currency: "CAD", scenario: "success", minorAmount: 99999 },
    { amount: 12.34, currency: "cad", scenario: "declined", minorAmount: 1234 },
    { amount: 20, currency: "CAD", scenario: "insufficient_funds", minorAmount: 2000 },
  ];
  for (const value of accepted) {
    const result = validatePaymentRequest(value);
    assert.equal(result.minorAmount, value.minorAmount);
  }

  for (const value of [
    { amount: 1, currency: "EUR", scenario: "success" },
    { amount: 1.001, currency: "USD", scenario: "success" },
    { amount: 1.0001, currency: "USD", scenario: "success" },
    { amount: 1.00000000001, currency: "USD", scenario: "success" },
    { amount: 10.291, currency: "USD", scenario: "success" },
    { amount: 0.001, currency: "USD", scenario: "success" },
    { amount: 0.01, currency: "USD", scenario: "success" },
    { amount: 0.49, currency: "USD", scenario: "success" },
    { amount: 0.01, currency: "CAD", scenario: "success" },
    { amount: 0.49, currency: "CAD", scenario: "success" },
    { amount: 0, currency: "USD", scenario: "success" },
    { amount: Infinity, currency: "USD", scenario: "success" },
    { amount: 1000000, currency: "USD", scenario: "success" },
    { amount: 1, currency: "USD", scenario: "pending" },
    { amount: 1, currency: "USD", scenario: "failed" },
    { amount: 1, currency: "USD", scenario: "authentication_required" },
  ]) {
    assert.throws(() => validatePaymentRequest(value), /Amount|supports|Scenario/);
  }
});

test("success creates and confirms one PaymentIntent with only the approved request shape", async () => {
  const { fake, adapter } = adapterWith(() => paymentIntent());
  const result = normalizeProviderResult(await adapter.executePayment(request()));

  assert.equal(result.provider, STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID);
  assert.equal(result.providerPaymentId, "pi_test_123");
  assert.equal(result.status, "completed");
  assert.equal(result.success, true);
  assert.equal(result.amount, 12.34);
  assert.equal(result.currency, "USD");
  assert.deepEqual(result.metadata, { scenario: "success" });
  assert.equal("client_secret" in result, false);
  assert.equal("payment_method" in result, false);
  assert.equal("lastResponse" in result, false);

  assert.deepEqual(fake.calls, [{
    params: {
      amount: 1234,
      currency: "usd",
      payment_method: TEST_PAYMENT_METHODS.success,
      payment_method_types: ["card"],
      confirm: true,
    },
    options: {
      idempotencyKey: PROVIDER_KEY,
      timeout: DEFAULT_TIMEOUT_MS,
      maxNetworkRetries: 0,
    },
  }]);
  const serializedCall = JSON.stringify(fake.calls[0]);
  for (const forbidden of ["req_aurapay_only", "customerEmail", "merchant", "metadata", "client_secret", "sk_test_"]) {
    assert.equal(serializedCall.includes(forbidden), false);
  }
});

test("recognized Stripe declines map to fixed AuraPay outcomes", async () => {
  const cases = [
    ["declined", "generic_decline", "card_declined"],
    ["insufficient_funds", "insufficient_funds", "insufficient_funds"],
  ];

  for (const [scenario, declineCode, expectedCode] of cases) {
    const { adapter } = adapterWith(() => {
      const error = new Error("raw Stripe decline must not escape");
      error.code = "card_declined";
      error.decline_code = declineCode;
      error.payment_intent = paymentIntent({ status: "requires_payment_method" });
      throw error;
    });
    const result = normalizeProviderResult(await adapter.executePayment(request({ scenario })));
    assert.equal(result.status, "failed");
    assert.equal(result.success, false);
    assert.equal(result.outcome.code, expectedCode);
    assert.equal(result.outcome.message.includes("raw Stripe"), false);
  }
});

test("live, malformed, mismatched, and unknown Stripe results fail closed", async () => {
  const results = [
    paymentIntent({ livemode: true }),
    paymentIntent({ object: "charge" }),
    paymentIntent({ id: "" }),
    paymentIntent({ amount: 999 }),
    paymentIntent({ currency: "cad" }),
    paymentIntent({ status: "processing" }),
  ];
  for (const returned of results) {
    const { adapter } = adapterWith(() => returned);
    await assert.rejects(() => adapter.executePayment(request()), StripeExternalSandboxResponseError);
  }
});

test("timeout, connection, server, rate-limit, and unrecognized errors remain uncertain", async () => {
  for (const type of ["StripeConnectionError", "StripeAPIError", "StripeRateLimitError", "unknown"]) {
    const { adapter } = adapterWith(() => {
      const error = new Error(`raw ${type} details`);
      error.type = type;
      throw error;
    });
    await assert.rejects(
      () => adapter.executePayment(request()),
      (error) => error instanceof StripeExternalSandboxUncertainError && !error.message.includes("raw")
    );
  }
});

test("missing or malformed provider idempotency context fails before a Stripe call", async () => {
  const { fake, adapter } = adapterWith(() => paymentIntent());
  for (const key of [undefined, "developer-raw-key", "ap_pay_v1_short"]) {
    await assert.rejects(
      () => adapter.executePayment(request({ providerIdempotencyKey: key })),
      StripeExternalSandboxUncertainError
    );
  }
  assert.equal(fake.calls.length, 0);
});
