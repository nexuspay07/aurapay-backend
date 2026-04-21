const stripe = require("../config/stripe");

// ===============================
// CREATE PAYMENT INTENT
// ===============================
async function createPaymentIntent(amount, currency = "usd") {
  if (!amount || Number(amount) <= 0) {
    throw new Error("Invalid amount");
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(Number(amount) * 100), // convert to cents
    currency: String(currency || "usd").toLowerCase(),
    automatic_payment_methods: { enabled: true },
  });

  return paymentIntent;
}

// ✅ EXPORT CORRECTLY
module.exports = {
  createPaymentIntent,
};