const express = require("express");
const router = express.Router();

const Stripe = require("stripe");

const paymentProcessingService =
  require("../services/paymentProcessingService");

const settlementService =
  require("../services/settlementService");

const WebhookEvent =
  require("../models/WebhookEvent");

const Transaction =
  require("../models/Transaction");

const CheckoutSession =
  require("../models/CheckoutSession");

const stripe = new Stripe(
  process.env.STRIPE_KEY ||
  process.env.STRIPE_SECRET_KEY
);

router.post(
  "/webhook",
  async (req, res) => {

    const signature =
      req.headers["stripe-signature"];

    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    // ======================================
    // VERIFY SIGNATURE
    // ======================================

    try {

      if (!webhookSecret) {

        console.error(
          "❌ STRIPE_WEBHOOK_SECRET missing"
        );

        return res.status(500).send(
          "Webhook secret not configured"
        );

      }

      event =
        stripe.webhooks.constructEvent(

          req.body,

          signature,

          webhookSecret

        );

    } catch (err) {

      return res.status(400).send(
        "Webhook Error"
      );

    }

    try {

      console.log(
        "✅ Stripe Webhook:",
        event.type
      );

      // ======================================
      // DUPLICATE WEBHOOK CHECK
      // ======================================

      const existingWebhook =
        await WebhookEvent.findOne({

          provider: "Stripe",

          eventId: event.id,

        });

      if (
        existingWebhook &&
        existingWebhook.status === "processed"
      ) {

        console.log(
          "⚠ Duplicate webhook:",
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

        // ======================================
        // FIND CHECKOUT SESSION
        // ======================================

        const checkoutSession =
          await CheckoutSession.findOne({

            stripePaymentIntentId:
              paymentIntent.id,

          });

        if (!checkoutSession) {

          console.error(

            "❌ Checkout Session not found:",

            paymentIntent.id

          );

          return res.status(404).json({

            error:
              "Checkout session not found",

          });

        }

        // ======================================
        // MARK CHECKOUT PAID
        // ======================================

        checkoutSession.status =
          "paid";

        checkoutSession.paidAt =
          new Date();

        await checkoutSession.save();

        // ======================================
        // CREATE OR RETURN TRANSACTION
        // ======================================

        const transaction =
          await paymentProcessingService.processSuccessfulPayment({

            merchant:
              checkoutSession.merchant,

            checkoutSession:
              checkoutSession._id,

            paymentIntentId:
              paymentIntent.id,

            amount:
              paymentIntent.amount / 100,

            currency:
              paymentIntent.currency.toUpperCase(),

            customerEmail:
              checkoutSession.customerEmail,

            provider:
              "Stripe",

          });

        // ======================================
        // CREATE SETTLEMENT ONLY ONCE
        // ======================================

        if (!transaction.settlement) {

          const settlement =
            await settlementService.createSettlement({

              merchant:
                checkoutSession.merchant,

              transaction:
                transaction._id,

              amount:
                paymentIntent.amount / 100,

              currency:
                paymentIntent.currency.toUpperCase(),

              merchantNet:
                transaction.merchantNet,

            });

          transaction.settlement =
            settlement._id;

          transaction.settled =
            false;

          await transaction.save();

        } else {

          console.log(
            "⚠ Settlement already exists for transaction:",
            transaction._id
          );

        }

        console.log(

          "✅ Payment processed:",

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

            provider:
              "Stripe",

            providerPaymentId:
              paymentIntent.id,

            providerEventId:
              event.id,

            status:
              "failed",

            success:
              false,

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
          "❌ Payment failed:",
          paymentIntent.id
        );

      }

      // ======================================
      // MARK WEBHOOK PROCESSED
      // ======================================

      await WebhookEvent.findOneAndUpdate(

        {

          provider: "Stripe",

          eventId:
            event.id,

        },

        {

          status:
            "processed",

          processedAt:
            new Date(),

          providerPaymentId:
            event.data?.object?.id || null,

        }

      );

      return res.json({

        received: true,

      });

    } catch (err) {

      console.error(
        "🔥 Stripe webhook error:",
        err
      );

      if (event?.id) {

        await WebhookEvent.findOneAndUpdate(

          {

            provider: "Stripe",

            eventId:
              event.id,

          },

          {

            status:
              "failed",

            errorMessage:
              err.message,

          },

          {

            upsert: true,

          }

        );

      }

      return res.status(500).json({

        error:
          "Failed to process Stripe webhook",

      });

    }

  }

);

module.exports = router;

