const express = require("express");
const router = express.Router();

const CheckoutSession =
  require("../models/CheckoutSession");

const Transaction =
  require("../models/Transaction");

router.post(
  "/complete/:sessionId",
  async (req, res) => {
    try {
      const session =
        await CheckoutSession.findOne({
          sessionId:
            req.params.sessionId,
        });

      if (!session) {
        return res.status(404).json({
          error: "Session not found",
        });
      }

      session.status = "paid";
      session.paidAt = new Date();

      await session.save();

      await Transaction.findOneAndUpdate(
        {
          providerPaymentId:
            session.stripePaymentIntentId,
        },
        {
          status: "completed",
          success: true,
        }
      );

      res.json({
        success: true,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;