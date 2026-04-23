const stripe = require("../config/stripe");

// ===============================
// CREATE PAYMENT INTENT
// ===============================
async function createPaymentIntent(amount, currency = "usd") {
  if (!amount || Number(amount) <= 0) {
    throw new Error("Invalid amount");
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(Number(amount) * 100),
    currency: String(currency || "usd").toLowerCase(),
    automatic_payment_methods: { enabled: true },
  });

  return paymentIntent;
}

// ===============================
// DIRECT STRIPE PAYMENT FOR /wallet/pay
// ===============================
async function payWithStripe({ amount, currency = "usd" }) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: String(currency || "usd").toLowerCase(),
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    return {
      success: true,
      id: paymentIntent.id,
      status: paymentIntent.status,
      latency: 0,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      status: "failed",
      latency: 0,
    };
  }
}

module.exports = {
  createPaymentIntent,
  payWithStripe,
};