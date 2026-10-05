const Stripe = require("stripe");

const {
  ProviderRequestValidationError,
} = require("./providerContract");

const STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID = "stripe_external_sandbox";
const DEFAULT_TIMEOUT_MS = 10000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30000;
const MIN_MINOR_AMOUNT = 50;
const MAX_MINOR_AMOUNT = 99999999;
const SUPPORTED_CURRENCIES = new Set(["USD", "CAD"]);
const TEST_PAYMENT_METHODS = Object.freeze({
  success: "pm_card_visa",
  declined: "pm_card_visa_chargeDeclined",
  insufficient_funds: "pm_card_visa_chargeDeclinedInsufficientFunds",
});

class StripeExternalSandboxConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "StripeExternalSandboxConfigurationError";
  }
}

class StripeExternalSandboxResponseError extends Error {
  constructor() {
    super("Stripe test mode returned an invalid payment result.");
    this.name = "StripeExternalSandboxResponseError";
  }
}

class StripeExternalSandboxUncertainError extends Error {
  constructor() {
    super("Stripe test payment outcome is uncertain.");
    this.name = "StripeExternalSandboxUncertainError";
  }
}

function isStripeExternalSandboxEnabled(env = process.env) {
  return env.STRIPE_EXTERNAL_SANDBOX_ENABLED === "true";
}

function parseTimeout(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_TIMEOUT_MS;
  if (!/^\d+$/.test(String(value))) {
    throw new StripeExternalSandboxConfigurationError("Stripe external sandbox timeout is invalid.");
  }
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new StripeExternalSandboxConfigurationError("Stripe external sandbox timeout is invalid.");
  }
  return timeoutMs;
}

function readStripeExternalSandboxConfig(env = process.env) {
  if (!isStripeExternalSandboxEnabled(env)) {
    throw new StripeExternalSandboxConfigurationError("Stripe external sandbox is disabled.");
  }

  const secretKey = String(env.STRIPE_TEST_SECRET_KEY || "").trim();
  if (!/^sk_test_[A-Za-z0-9]{16,}$/.test(secretKey)) {
    throw new StripeExternalSandboxConfigurationError("Stripe external sandbox test credentials are invalid.");
  }

  return Object.freeze({
    secretKey,
    timeoutMs: parseTimeout(env.STRIPE_EXTERNAL_TIMEOUT_MS),
  });
}

function validatePaymentRequest({ amount, currency, scenario }) {
  const normalizedAmount = Number(amount);
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  const normalizedScenario = String(scenario || "success").trim().toLowerCase();

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new ProviderRequestValidationError("Amount must be greater than zero.");
  }
  if (!SUPPORTED_CURRENCIES.has(normalizedCurrency)) {
    throw new ProviderRequestValidationError("Stripe external sandbox supports USD and CAD only.");
  }

  const decimalMatch = String(normalizedAmount).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!decimalMatch) {
    throw new ProviderRequestValidationError("Amount must have no more than two decimal places.");
  }
  const [, wholeDigits, fractionDigits = "", exponentText = "0"] = decimalMatch;
  const exponent = Number(exponentText);
  const decimalPlaces = Math.max(0, fractionDigits.length - exponent);
  if (decimalPlaces > 2) {
    throw new ProviderRequestValidationError("Amount must have no more than two decimal places.");
  }
  const digits = `${wholeDigits}${fractionDigits}`.replace(/^0+(?=\d)/, "");
  const minorDigits = `${digits}${"0".repeat(exponent - fractionDigits.length + 2)}`;
  const minorAmount = Number(minorDigits);
  if (minorAmount < MIN_MINOR_AMOUNT || minorAmount > MAX_MINOR_AMOUNT) {
    throw new ProviderRequestValidationError("Amount is outside the supported Stripe test range.");
  }
  if (!Number.isSafeInteger(minorAmount)) {
    throw new ProviderRequestValidationError("Amount is outside the supported Stripe test range.");
  }
  if (!Object.prototype.hasOwnProperty.call(TEST_PAYMENT_METHODS, normalizedScenario)) {
    throw new ProviderRequestValidationError("Scenario is not supported by Stripe external sandbox.");
  }

  return Object.freeze({
    amount: normalizedAmount,
    currency: normalizedCurrency,
    scenario: normalizedScenario,
    minorAmount,
  });
}

function validatePaymentIntent(paymentIntent, expected) {
  if (
    !paymentIntent ||
    paymentIntent.object !== "payment_intent" ||
    typeof paymentIntent.id !== "string" ||
    !paymentIntent.id.trim() ||
    paymentIntent.livemode !== false ||
    paymentIntent.amount !== expected.minorAmount ||
    String(paymentIntent.currency || "").toUpperCase() !== expected.currency
  ) {
    throw new StripeExternalSandboxResponseError();
  }
  return paymentIntent;
}

function normalizedResult(validated, paymentIntent, status, success, code, message) {
  return {
    provider: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
    providerPaymentId: paymentIntent.id,
    status,
    success,
    outcome: { code, message },
    amount: validated.amount,
    currency: validated.currency,
    environment: "sandbox",
    livemode: false,
    metadata: { scenario: validated.scenario },
  };
}

function extractPaymentIntent(error) {
  return error?.payment_intent || error?.raw?.payment_intent || null;
}

function normalizeDefinitiveDecline(error, validated) {
  if (error?.code !== "card_declined") return null;
  const paymentIntent = validatePaymentIntent(extractPaymentIntent(error), validated);
  if (paymentIntent.status !== "requires_payment_method") {
    throw new StripeExternalSandboxResponseError();
  }

  const declineCode = String(error.decline_code || error.raw?.decline_code || "");
  if (validated.scenario === "insufficient_funds" && declineCode !== "insufficient_funds") {
    throw new StripeExternalSandboxResponseError();
  }
  if (validated.scenario === "declined" && declineCode === "insufficient_funds") {
    throw new StripeExternalSandboxResponseError();
  }

  if (declineCode === "insufficient_funds") {
    return normalizedResult(
      validated,
      paymentIntent,
      "failed",
      false,
      "insufficient_funds",
      "Stripe test payment failed due to insufficient funds."
    );
  }

  return normalizedResult(
    validated,
    paymentIntent,
    "failed",
    false,
    "card_declined",
    "Stripe test payment was declined."
  );
}

function createStripeExternalSandboxPaymentProvider({ stripeClient, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!stripeClient?.paymentIntents || typeof stripeClient.paymentIntents.create !== "function") {
    throw new TypeError("Stripe external sandbox requires a PaymentIntent client.");
  }
  const validatedTimeout = parseTimeout(timeoutMs);

  return Object.freeze({
    id: STRIPE_EXTERNAL_SANDBOX_PROVIDER_ID,
    validatePaymentRequest,
    async executePayment(request) {
      const validated = validatePaymentRequest(request);
      const providerIdempotencyKey = String(request?.providerIdempotencyKey || "");
      if (!/^ap_pay_v1_[A-Za-z0-9_-]{43}$/.test(providerIdempotencyKey)) {
        throw new StripeExternalSandboxUncertainError();
      }

      let paymentIntent;
      try {
        paymentIntent = await stripeClient.paymentIntents.create(
          {
            amount: validated.minorAmount,
            currency: validated.currency.toLowerCase(),
            payment_method: TEST_PAYMENT_METHODS[validated.scenario],
            payment_method_types: ["card"],
            confirm: true,
          },
          {
            idempotencyKey: providerIdempotencyKey,
            timeout: validatedTimeout,
            maxNetworkRetries: 0,
          }
        );
      } catch (error) {
        try {
          const decline = normalizeDefinitiveDecline(error, validated);
          if (decline) return decline;
        } catch (validationError) {
          if (validationError instanceof StripeExternalSandboxResponseError) throw validationError;
        }
        throw new StripeExternalSandboxUncertainError();
      }

      validatePaymentIntent(paymentIntent, validated);
      if (paymentIntent.status !== "succeeded") {
        throw new StripeExternalSandboxResponseError();
      }

      return normalizedResult(
        validated,
        paymentIntent,
        "completed",
        true,
        "payment_completed",
        "Stripe test payment completed."
      );
    },
  });
}

function createStripeExternalSandboxPaymentProviderFromEnvironment({
  env = process.env,
  stripeFactory = (secretKey, options) => new Stripe(secretKey, options),
} = {}) {
  const config = readStripeExternalSandboxConfig(env);
  const stripeClient = stripeFactory(config.secretKey, {
    timeout: config.timeoutMs,
    maxNetworkRetries: 0,
    telemetry: false,
  });
  return createStripeExternalSandboxPaymentProvider({
    stripeClient,
    timeoutMs: config.timeoutMs,
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
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
};
