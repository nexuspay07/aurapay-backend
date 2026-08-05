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

    const paymentIntent = await createPaymentIntent(amount, currency);

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to create Stripe payment intent",
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
      merchant: req.user.merchantId,
      user: req.user._id,
      amount: Number(amount),
      currency: String(currency).toLowerCase(),
      provider: "Stripe",
      transactionId: paymentIntentId,
      providerPaymentId: paymentIntentId,
      status: status || "completed",
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
    res.status(500).json({
      error: "Failed to save Stripe payment",
    });
  }
});

module.exports = router;
