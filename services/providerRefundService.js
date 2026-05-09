const Stripe = require("stripe");

const stripe = new Stripe(
  process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY
);

async function refundStripePayment({ paymentIntentId, amount, currency }) {
  if (!paymentIntentId) {
    throw new Error("Missing Stripe PaymentIntent ID");
  }

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: Math.round(Number(amount) * 100),
    metadata: {
      currency,
      source: "AuraPay",
    },
  });

  return {
    success: true,
    provider: "Stripe",
    refundId: refund.id,
    status: refund.status,
    raw: refund,
  };
}

async function refundPayPalPayment({ captureId }) {
  if (!captureId) {
    throw new Error("Missing PayPal capture ID");
  }

  // We will wire this after confirming your PayPal service structure.
  // PayPal requires refunding the capture ID:
  // POST /v2/payments/captures/{capture_id}/refund
  throw new Error("PayPal refund sync not connected yet");
}

async function refundProviderPayment({ provider, providerPaymentId, amount, currency }) {
  if (provider === "Stripe") {
    return refundStripePayment({
      paymentIntentId: providerPaymentId,
      amount,
      currency,
    });
  }

  if (provider === "PayPal") {
    return refundPayPalPayment({
      captureId: providerPaymentId,
      amount,
      currency,
    });
  }

  throw new Error(`Unsupported refund provider: ${provider}`);
}

module.exports = {
  refundProviderPayment,
};