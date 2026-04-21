const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const { createPaymentIntent } = require("../services/stripeService");

router.post("/create-payment-intent", auth, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    const paymentIntent = await createPaymentIntent(amount, currency);

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;