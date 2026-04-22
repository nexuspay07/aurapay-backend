const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const Transaction = require("../models/Transaction");

const { createPaymentIntent } = require("../services/stripeService");
const { payWithPayPal } = require("../services/paypalService");

// ===============================
// UNIFIED CHECKOUT
// ===============================
router.post("/", auth, async (req, res) => {
  try {
    const { provider, amount, currency } = req.body;

    if (!provider) {
      return res.status(400).json({ error: "Provider is required" });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const normalizedProvider = String(provider).toLowerCase();
    const normalizedCurrency = String(currency || "usd").toLowerCase();

    // =========================================
    // STRIPE
    // =========================================
    if (normalizedProvider === "stripe") {
      const paymentIntent = await createPaymentIntent(amount, normalizedCurrency);

      return res.json({
        provider: "Stripe",
        mode: "stripe",
        clientSecret: paymentIntent.client_secret,
      });
    }

    // =========================================
    // PAYPAL
    // =========================================
    if (normalizedProvider === "paypal") {
      const result = await payWithPayPal({
        amount: Number(amount),
        currency: normalizedCurrency,
      });

      if (!result.success) {
        return res.status(400).json({
          error: result.error || "PayPal payment failed",
        });
      }

      const transaction = await Transaction.create({
        user: req.user._id,
        amount: Number(amount),
        currency: normalizedCurrency,
        provider: "PayPal",
        transactionId: result.id,
        status: result.status || "completed",
        latency: result.latency || 0,
        attempts: 1,
        errorMessage: null,
        success: true,
        paymentType: "paypal",
      });

      return res.json({
        provider: "PayPal",
        mode: "direct",
        message: "PayPal payment completed and saved",
        transaction,
      });
    }

    return res.status(400).json({
      error: "Unsupported provider",
    });
  } catch (err) {
    console.error("❌ CHECKOUT ROUTE ERROR:", err);
    res.status(500).json({
      error: err.message || "Checkout failed",
    });
  }
});

// ===============================
// SAVE STRIPE PAYMENT
// ===============================
router.post("/save-stripe-payment", auth, async (req, res) => {
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
      status: status || "succeeded",
      latency: 0,
      attempts: 1,
      errorMessage: null,
      success: true,
      paymentType: "stripe",
    });

    res.json({
      message: "Stripe payment saved successfully",
      transaction,
    });
  } catch (err) {
    console.error("❌ SAVE STRIPE PAYMENT ERROR:", err);
    res.status(500).json({
      error: err.message || "Failed to save Stripe payment",
    });
  }
});

module.exports = router;