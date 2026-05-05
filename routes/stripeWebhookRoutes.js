const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

const Transaction = require("../models/Transaction");

const stripe = new Stripe(process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY);

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      if (!webhookSecret) {
        console.error("❌ Missing STRIPE_WEBHOOK_SECRET");
        return res.status(500).send("Webhook secret not configured");
      }

      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("❌ Stripe webhook signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      console.log("✅ Stripe webhook received:", event.type);

      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;

        await Transaction.findOneAndUpdate(
          {
            $or: [
              { transactionId: paymentIntent.id },
              { providerPaymentId: paymentIntent.id },
            ],
          },
          {
            provider: "Stripe",
            providerPaymentId: paymentIntent.id,
            providerEventId: event.id,
            status: "completed",
            success: true,
            confirmedAt: new Date(),
            rawProviderResponse: paymentIntent,
          },
          { new: true }
        );

        console.log("✅ Stripe payment confirmed:", paymentIntent.id);
      }

      if (event.type === "payment_intent.payment_failed") {
        const paymentIntent = event.data.object;

        await Transaction.findOneAndUpdate(
          {
            $or: [
              { transactionId: paymentIntent.id },
              { providerPaymentId: paymentIntent.id },
            ],
          },
          {
            provider: "Stripe",
            providerPaymentId: paymentIntent.id,
            providerEventId: event.id,
            status: "failed",
            success: false,
            failedAt: new Date(),
            errorMessage:
              paymentIntent.last_payment_error?.message ||
              "Stripe payment failed",
            rawProviderResponse: paymentIntent,
          },
          { new: true }
        );

        console.log("❌ Stripe payment failed:", paymentIntent.id);
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("🔥 Stripe webhook processing error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;