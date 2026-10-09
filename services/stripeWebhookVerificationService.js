const Stripe = require("stripe");

const SIGNATURE_TOLERANCE_SECONDS = 300;
const SUPPORTED_EVENT_TYPES = new Map([
  ["payment_intent.succeeded", "succeeded"],
  ["payment_intent.payment_failed", "requires_payment_method"],
]);

class StripeWebhookConfigurationError extends Error {
  constructor() {
    super("Stripe test webhook verification is unavailable.");
    this.name = "StripeWebhookConfigurationError";
  }
}

class StripeWebhookVerificationError extends Error {
  constructor(message = "Stripe test webhook verification failed.") {
    super(message);
    this.name = "StripeWebhookVerificationError";
  }
}

function readStripeTestWebhookConfig(env = process.env) {
  if (env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED !== "true") {
    throw new StripeWebhookConfigurationError();
  }

  const secret = String(env.STRIPE_TEST_WEBHOOK_SECRET || "").trim();
  if (!/^whsec_[A-Za-z0-9]{16,}$/.test(secret)) {
    throw new StripeWebhookConfigurationError();
  }

  return Object.freeze({
    secret,
    toleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
  });
}

function assertSupportedTestEvent(event) {
  if (
    !event ||
    event.object !== "event" ||
    typeof event.id !== "string" ||
    !/^evt_[A-Za-z0-9_]+$/.test(event.id) ||
    event.livemode !== false ||
    !SUPPORTED_EVENT_TYPES.has(event.type)
  ) {
    throw new StripeWebhookVerificationError();
  }

  const paymentIntent = event.data?.object;
  if (
    !paymentIntent ||
    paymentIntent.object !== "payment_intent" ||
    typeof paymentIntent.id !== "string" ||
    !/^pi_[A-Za-z0-9_]+$/.test(paymentIntent.id) ||
    paymentIntent.livemode !== false ||
    paymentIntent.status !== SUPPORTED_EVENT_TYPES.get(event.type) ||
    !Number.isSafeInteger(paymentIntent.amount) ||
    paymentIntent.amount <= 0 ||
    !/^[a-z]{3}$/.test(String(paymentIntent.currency || ""))
  ) {
    throw new StripeWebhookVerificationError();
  }

  return Object.freeze({
    id: event.id,
    type: event.type,
    livemode: false,
    providerObjectId: paymentIntent.id,
  });
}

function verifyStripeTestWebhook({ rawBody, signature, env = process.env }) {
  const config = readStripeTestWebhookConfig(env);
  if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !signature.trim()) {
    throw new StripeWebhookVerificationError();
  }

  let event;
  try {
    event = Stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.secret,
      config.toleranceSeconds
    );
  } catch {
    throw new StripeWebhookVerificationError();
  }

  return assertSupportedTestEvent(event);
}

module.exports = {
  SIGNATURE_TOLERANCE_SECONDS,
  StripeWebhookConfigurationError,
  StripeWebhookVerificationError,
  assertSupportedTestEvent,
  readStripeTestWebhookConfig,
  verifyStripeTestWebhook,
};
