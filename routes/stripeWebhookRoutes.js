const express = require("express");
const router = express.Router();

const Stripe = require("stripe");

const WebhookEvent =
  require("../models/WebhookEvent");

const Transaction =
  require("../models/Transaction");

const CheckoutSession =
  require("../models/CheckoutSession");

const Settlement =
  require("../models/Settlement");

const stripe = new Stripe(
  process.env.STRIPE_KEY ||
  process.env.STRIPE_SECRET_KEY
);

router.post(
  "/webhook",
  express.raw({
    type: "application/json",
  }),
  async (req, res) => {
    const sig =
      req.headers[
        "stripe-signature"
      ];

    const webhookSecret =
      process.env
        .STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      if (!webhookSecret) {
        console.error(
          "❌ Missing STRIPE_WEBHOOK_SECRET"
        );

        return res
          .status(500)
          .send(
            "Webhook secret not configured"
          );
      }

      event =
        stripe.webhooks.constructEvent(
          req.body,
          sig,
          webhookSecret
        );
    } catch (err) {
      console.error(
        "❌ Stripe webhook signature failed:",
        err.message
      );

      return res
        .status(400)
        .send(
          `Webhook Error: ${err.message}`
        );
    }

    try {
      console.log(
        "✅ Stripe webhook received:",
        event.type
      );

      const existingEvent =
        await WebhookEvent.findOne({
          provider: "Stripe",
          eventId: event.id,
        });

      if (
        existingEvent?.status ===
        "processed"
      ) {
        console.log(
          "⚠️ Duplicate Stripe webhook ignored:",
          event.id
        );

        return res.json({
          received: true,
          duplicate: true,
        });
      }

      await WebhookEvent.findOneAndUpdate(
        {
          provider: "Stripe",
          eventId: event.id,
        },
        {
          provider: "Stripe",
          eventId: event.id,
          eventType: event.type,
          status: "processing",
          rawEvent: event,
        },
        {
          upsert: true,
          new: true,
        }
      );

      // ======================================
      // PAYMENT SUCCEEDED
      // ======================================

      if (
        event.type ===
        "payment_intent.succeeded"
      ) {
        const paymentIntent =
          event.data.object;

        await Transaction.findOneAndUpdate(
          {
            $or: [
              {
                transactionId:
                  paymentIntent.id,
              },
              {
                providerPaymentId:
                  paymentIntent.id,
              },
            ],
          },
          {
            provider: "Stripe",
            providerPaymentId:
              paymentIntent.id,
            providerEventId:
              event.id,
            status:
              "completed",
            success: true,
            confirmedAt:
              new Date(),
            rawProviderResponse:
              paymentIntent,
          },
          {
            new: true,
          }
        );

        await CheckoutSession.findOneAndUpdate(
          {
            stripePaymentIntentId:
              paymentIntent.id,
          },
          {
            status: "paid",
            paidAt: new Date(),
          }
        );

        await Settlement.create({
          amount:
            paymentIntent.amount /
            100,

          currency:
            paymentIntent.currency.toUpperCase(),

          status: "pending",

          transactionCount: 1,
        });

        console.log(
          "✅ Stripe payment confirmed:",
          paymentIntent.id
        );
      }

      // ======================================
      // PAYMENT FAILED
      // ======================================

      if (
        event.type ===
        "payment_intent.payment_failed"
      ) {
        const paymentIntent =
          event.data.object;

        await Transaction.findOneAndUpdate(
          {
            $or: [
              {
                transactionId:
                  paymentIntent.id,
              },
              {
                providerPaymentId:
                  paymentIntent.id,
              },
            ],
          },
          {
            provider: "Stripe",
            providerPaymentId:
              paymentIntent.id,
            providerEventId:
              event.id,
            status: "failed",
            success: false,
            failedAt:
              new Date(),
            errorMessage:
              paymentIntent
                .last_payment_error
                ?.message ||
              "Stripe payment failed",
            rawProviderResponse:
              paymentIntent,
          },
          {
            new: true,
          }
        );

        console.log(
          "❌ Stripe payment failed:",
          paymentIntent.id
        );
      }

      await WebhookEvent.findOneAndUpdate(
        {
          provider: "Stripe",
          eventId: event.id,
        },
        {
          status: "processed",
          processedAt:
            new Date(),
          providerPaymentId:
            event.data?.object
              ?.id || null,
        }
      );

      return res.json({
        received: true,
      });
    } catch (err) {
      console.error(
        "🔥 Stripe webhook processing error:",
        err
      );

      if (event?.id) {
        await WebhookEvent.findOneAndUpdate(
          {
            provider: "Stripe",
            eventId: event.id,
          },
          {
            status: "failed",
            errorMessage:
              err.message,
          },
          {
            upsert: true,
          }
        );
      }

      return res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;