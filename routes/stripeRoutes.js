const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const { createPaymentIntent } = require("../services/stripeService");
const Transaction = require("../models/Transaction");

// ===============================
// CREATE PAYMENT INTENT
// ===============================
router.post("/create-payment-intent", auth, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    console.log("🔥 Stripe request body:", req.body);
    console.log("👤 Auth user:", req.user?._id);

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

// ===============================
// SAVE SUCCESSFUL STRIPE PAYMENT
// ===============================
router.post("/save-payment", auth, async (req, res) => {
  try {
    const { amount, currency, paymentIntentId, status } = req.body;

    if (!amount || !currency || !paymentIntentId) {
      return res.status(400).json({
        error: "Missing required payment fields",
      });
    }

    const transaction = await Transaction.create({
      user: req.user._id,
      amount: Number(amount),
      currency: String(currency).toLowerCase(),
      provider: "Stripe",
      transactionId: paymentIntentId,
      status: status || "completed",
      success: true,
      paymentType: "stripe",
      latency: 0,
      attempts: 1,
    });

    res.json({
      message: "Stripe payment saved successfully",
      transaction,
    });
  } catch (err) {
    console.error("❌ SAVE PAYMENT ERROR:", err);
    res.status(500).json({
      error: err.message || "Failed to save Stripe payment",
    });
  }
});

module.exports = router;