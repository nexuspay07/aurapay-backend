const express = require("express");

const router = express.Router();

const CheckoutSession =
  require(
    "../models/CheckoutSession"
  );

  const Transaction =
  require("../models/Transaction");

  console.log(
  "STRIPE KEY:",
  process.env.STRIPE_KEY
);

  const stripe =
  require("stripe")(
    process.env.STRIPE_KEY
  );

  // ======================================
// GET SINGLE SESSION
// ======================================

router.get(
  "/sessions/by-code/:sessionId",
  async (req, res) => {
    try {
      const session =
        await CheckoutSession.findOne(
          {
            sessionId:
              req.params
                .sessionId,
          }
        );

      if (!session) {
        return res.status(404).json({
          error:
            "Session not found",
        });
      }

      res.json(session);
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

  // ======================================
// CREATE PAYMENT INTENT
// ======================================

router.post(
  "/sessions/:id/pay",
  async (req, res) => {
    try {
      const session =
        await CheckoutSession.findById(
          req.params.id
        );

      if (!session) {
        return res.status(404).json({
          error:
            "Session not found",
        });
      }

      const paymentIntent =
        await stripe.paymentIntents.create(
          {
            amount:
              Math.round(
                session.amount *
                  100
              ),

            currency:
              session.currency.toLowerCase(),
          }
        );

      session.stripePaymentIntentId =
        paymentIntent.id;

        await Transaction.create({
  user: null,

  amount: session.amount,

  currency:
    session.currency,

  provider: "Stripe",

  transactionId:
    paymentIntent.id,

  providerPaymentId:
    paymentIntent.id,

  status: "processing",

  paymentType: "stripe",

  success: false,
});

      await session.save();

      res.json({
        clientSecret:
          paymentIntent.client_secret,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

  // ======================================
// CREATE CHECKOUT SESSION
// ======================================



router.post(
  "/sessions",
  async (req, res) => {
    try {
      const {
        merchant,
        amount,
        currency,
        customerEmail,
      } = req.body;

      const session =
        await CheckoutSession.create({
          merchant,

          sessionId:
            "CHK_" +
            Date.now(),

          amount,

          currency:
            currency || "USD",

          customerEmail:
            customerEmail || "",

          status:
            "created",
        });

      res.status(201).json(
        session
      );
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

// ======================================
// GET ALL CHECKOUT SESSIONS
// ======================================

router.get(
  "/sessions",
  async (req, res) => {
    try {
      const sessions =
        await CheckoutSession.find()
          .populate(
            "merchant"
          )
          .sort({
            createdAt: -1,
          });

      res.json(sessions);
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;