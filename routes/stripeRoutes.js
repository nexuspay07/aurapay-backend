const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const { createPaymentIntent } = require("../services/stripeService");

// ===============================
// CREATE PAYMENT INTENT
// ===============================
router.post("/create-payment-intent", auth, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    console.log("🔥 Stripe request body:", req.body);
    console.log("👤 Auth user:", req.user?.id);

    const paymentIntent = await createPaymentIntent(amount, currency);

    console.log("✅ PaymentIntent created:", paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error("❌ FULL STRIPE ERROR:", err);

    res.status(500).json({
      error: err.message,
      type: err.type || "StripeError",
      raw: err.raw || null,
    });
  }
});

module.exports = router;