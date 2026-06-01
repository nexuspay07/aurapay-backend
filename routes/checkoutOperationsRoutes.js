const express = require("express");

const router = express.Router();

const CheckoutSession =
  require(
    "../models/CheckoutSession"
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