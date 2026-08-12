const checkoutService =
  require("../services/checkoutService");
const sandboxPaymentSimulationService =
  require("../services/sandboxPaymentSimulationService");
const mongoose = require("mongoose");

// ======================================
// CREATE CHECKOUT SESSION
// ======================================

exports.createSession =
  async (req, res) => {

    try {

      const session =
        await checkoutService.createSession(
          req.merchant._id,
          req.body
        );

      return res.status(201).json(session);

    } catch (err) {

      return res.status(500).json({
        success: false,
        error:
          "Failed to create checkout session.",
      });

    }

  };

// ======================================
// GET MERCHANT SESSIONS
// ======================================

exports.getMerchantSessions =
  async (req, res) => {

    try {

      const sessions =
        await checkoutService.getMerchantSessions(
          req.merchant._id
        );

      return res.json(sessions);

    } catch (err) {

      return res.status(500).json({
        success: false,
        error:
          "Failed to load checkout sessions.",
      });

    }

  };

// ======================================
// GET SESSION
// ======================================

exports.getSession =
  async (req, res) => {

    try {

      const session =
        await checkoutService.getSession(
          req.params.sessionId
        );

      if (!session) {

        return res.status(404).json({
          success: false,
          error:
            "Checkout session not found.",
        });

      }

      return res.json(session);

    } catch (err) {

      return res.status(500).json({
        success: false,
        error:
          "Failed to load checkout session.",
      });

    }

  };

// ======================================
// CREATE PAYMENT INTENT
// ======================================

exports.createPaymentIntent =
  async (req, res) => {

    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID.",
        });
      }

      const result =
        await checkoutService.createPaymentIntent(
          req.params.id
        );

      return res.json(result);

    } catch (err) {

      return res.status(500).json({
        success: false,
        error:
          "Failed to create payment intent.",
      });

    }

  };

// ======================================
// MARK SESSION PAID
// ======================================

exports.markPaid =
  async (req, res) => {

    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID.",
        });
      }

      const session =
        await checkoutService.markPaid(
          req.params.id
        );

      return res.json({
        success: true,
        session,
      });

    } catch (err) {

      return res.status(500).json({
        success: false,
        error:
          "Failed to update checkout session.",
      });

    }

  };

// ======================================
// SIMULATE SANDBOX CHECKOUT PAYMENT
// ======================================

exports.simulatePayment =
  async (req, res) => {

    try {

      const result =
        await sandboxPaymentSimulationService.simulateCheckoutPayment(
          req.params.sessionId,
          req.body?.scenario || "success"
        );

      return res.json({
        success: true,
        data: {
          checkout: result.checkoutSession,
          transaction: result.transaction,
          settlement: result.settlement,
          scenario: result.scenario,
          outcome: result.outcome,
          replay: result.replay,
        },
      });

    } catch (err) {

      return res.status(err.statusCode || 500).json({
        success: false,
        error:
          err.message || "Failed to simulate checkout payment.",
      });

    }

  };
