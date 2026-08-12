const express = require("express");

const router = express.Router();

const merchantAuth =
  require("../middlewares/merchantAuth");

const checkoutOperationsController =
  require("../controllers/checkoutOperationsController");

const CheckoutSession =
  require("../models/CheckoutSession");

const mongoose = require("mongoose");

function invalidId(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid ID.",
  });
}

// ======================================
// CREATE CHECKOUT SESSION
// ======================================

router.post(
  "/sessions",
  merchantAuth,
  checkoutOperationsController.createSession
);

// ======================================
// GET ALL MERCHANT SESSIONS
// ======================================

router.get(
  "/sessions",
  merchantAuth,
  checkoutOperationsController.getMerchantSessions
);

// ======================================
// GET SESSION BY SESSION ID
// ======================================

router.get(
  "/sessions/by-code/:sessionId",
  checkoutOperationsController.getSession
);

// ======================================
// CREATE STRIPE PAYMENT INTENT
// (PUBLIC ROUTE)
// ======================================

router.post(
  "/sessions/:id/pay",
  checkoutOperationsController.createPaymentIntent
);

router.post(
  "/sessions/by-code/:sessionId/simulate",
  checkoutOperationsController.simulatePayment
);

// ======================================
// MARK SESSION AS PAID
// (USED BY WEBHOOK / INTERNAL)
// ======================================

router.patch(
  "/sessions/:id/status",
  merchantAuth,
  checkoutOperationsController.markPaid
);

router.patch(
  "/sessions/:id/archive",
  merchantAuth,
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const session =
        await CheckoutSession.findOneAndUpdate(
          {
            _id: req.params.id,
            merchant: req.merchant._id,
          },
          {
            status: "expired",
          },
          {
            new: true,
          }
        );

      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Checkout session not found.",
        });
      }

      return res.json({
        success: true,
        session,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "Failed to archive checkout session.",
      });
    }
  }
);

router.delete(
  "/sessions/:id",
  merchantAuth,
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const session =
        await CheckoutSession.findOneAndDelete({
          _id: req.params.id,
          merchant: req.merchant._id,
        });

      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Checkout session not found.",
        });
      }

      return res.json({
        success: true,
        message: "Checkout session deleted.",
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete checkout session.",
      });
    }
  }
);

module.exports = router;
