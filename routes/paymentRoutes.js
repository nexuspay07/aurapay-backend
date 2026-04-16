console.log("🔥 paymentRoutes LOADED");

const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const User = require("../models/User");
const FraudLog = require("../models/FraudLog");

const measureExecution = require("../utils/measure");
const auth = require("../middlewares/auth");

const { payWithStripe } = require("../services/stripeService");
const { payWithPayPal } = require("../services/paypalService");
const { chooseBestProvider } = require("../services/routingService");
const { convert } = require("../services/fxservice");

const { detectFraud } = require("../services/fraudService");
const { getProviderStats } = require("../services/metricsService");
const { updateUserProfile } = require("../services/riskProfileService");
const { processTransactionFeedback } = require("../services/feedbackService");
const { applyDefense } = require("../services/defenseService");

const round = (num) => Math.round(num * 100) / 100;
const MAX_PAYMENT_LIMIT = 10000;

router.get("/test", (req, res) => {
  res.send("✅ payment route works");
});

router.post("/pay", auth, async (req, res) => {
  if (
    req.user.frozen &&
    req.user.freezeUntil &&
    new Date(req.user.freezeUntil) > new Date()
  ) {
    return res.status(403).json({
      status: "blocked",
      message: "Account is temporarily frozen",
      freezeUntil: req.user.freezeUntil,
    });
  }

  console.log("🔥 NEW PAYMENT REQUEST:", req.body);

  const data = req.body;

  try {
    let result;
    let providerUsed;
    let attempts = 1;

    const amount = Number(data.amount);
    const currency = String(data.currency || "").toLowerCase();

    // ==================================================
    // 🔒 PHASE 26 — BASIC PRODUCTION SAFETY
    // ==================================================

    // 1. Validate amount
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
      });
    }

    // 2. Validate supported currencies
    if (!["usd", "eur"].includes(currency)) {
      return res.status(400).json({
        error: "Unsupported currency",
      });
    }

    // 3. Max payment protection
    if (amount > MAX_PAYMENT_LIMIT) {
      return res.status(400).json({
        error: `Amount exceeds maximum limit (${MAX_PAYMENT_LIMIT})`,
      });
    }

    // 4. Validate user balance object exists
    if (!req.user.balance || typeof req.user.balance !== "object") {
      return res.status(400).json({
        error: "User wallet is not configured properly",
      });
    }

    // 5. Ensure missing balances default to 0
    const currentUsd = Number(req.user.balance.usd || 0);
    const currentEur = Number(req.user.balance.eur || 0);

    // 🛡️ fraud detection
    const fraudResult = await detectFraud(req.user, {
      ...data,
      amount,
      currency,
      req,
    });

    console.log("🛡️ Fraud Decision:", fraudResult);

    await FraudLog.create({
      user: req.user._id,
      amount,
      currency,
      riskScore: fraudResult.riskScore,
      decision: fraudResult.decision,
      reasons: fraudResult.reasons,
    });

    if (fraudResult.decision === "BLOCK") {
      const defense = await applyDefense(req.user, fraudResult);
      console.log("🛡️ Defense Action:", defense);

      await processTransactionFeedback({
        user: req.user._id,
        success: false,
        fraud: true,
        fraudDecision: fraudResult.decision,
        amount,
        provider: null,
      });

      return res.status(403).json({
        status: "blocked",
        message: "Transaction blocked due to fraud risk",
        defense,
        fraud: fraudResult,
      });
    }

    if (fraudResult.decision === "FLAG") {
      console.log("⚠️ Suspicious transaction:", fraudResult.reasons);
    }

    // 💰 balance check
    let usedConverted = false;

    const currentBalance =
      currency === "usd" ? currentUsd : currentEur;

    if (currentBalance >= amount) {
      console.log("✅ Enough balance");
    } else {
      const otherCurrency = currency === "usd" ? "eur" : "usd";
      const otherBalance =
        otherCurrency === "usd" ? currentUsd : currentEur;

      const converted = convert(otherBalance, otherCurrency, currency);

      if (converted >= amount) {
        console.log("💱 Using converted balance");

        const needed = round(convert(amount, currency, otherCurrency));

        await User.findByIdAndUpdate(req.user._id, {
          $inc: { [`balance.${otherCurrency}`]: -needed },
        });

        usedConverted = true;
      } else {
        return res.status(400).json({
          error: "Insufficient balance",
        });
      }
    }

    // 🧠 routing
    const bestProvider = await chooseBestProvider(currency);
    console.log("🧠 AI Routing chose:", bestProvider);

    if (bestProvider === "Stripe") {
      result = await measureExecution(() => payWithStripe({
        ...data,
        amount,
        currency,
      }));
      providerUsed = "Stripe";
    } else {
      result = await measureExecution(() => payWithPayPal({
        ...data,
        amount,
        currency,
      }));
      providerUsed = "PayPal";
    }

    console.log("📊 First attempt:", result);

    // 🔁 fallback
    if (!result.success) {
      attempts++;

      if (providerUsed === "Stripe") {
        result = await measureExecution(() => payWithPayPal({
          ...data,
          amount,
          currency,
        }));
        providerUsed = "PayPal";
      } else {
        result = await measureExecution(() => payWithStripe({
          ...data,
          amount,
          currency,
        }));
        providerUsed = "Stripe";
      }
    }

    // ❌ final failure
    if (!result.success) {
      if (usedConverted) {
        const otherCurrency = currency === "usd" ? "eur" : "usd";
        const refund = round(convert(amount, currency, otherCurrency));

        await User.findByIdAndUpdate(req.user._id, {
          $inc: { [`balance.${otherCurrency}`]: refund },
        });
      }

      await processTransactionFeedback({
        user: req.user._id,
        success: false,
        fraud: false,
        fraudDecision: fraudResult?.decision || "UNKNOWN",
        amount,
        provider: providerUsed,
      });

      return res.status(400).json({
        status: "failed",
        error: result.error || "Payment failed",
      });
    }

    // 💰 final deduction
    if (!usedConverted) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { [`balance.${currency}`]: -amount },
      });
    }

    const updatedUser = await User.findById(req.user._id);

    await Transaction.create({
      user: req.user._id,
      amount,
      currency,
      provider: providerUsed,
      transactionId: result.id,
      status: result.status,
      latency: result.latency || 0,
      attempts,
      errorMessage: result.error || null,
      success: true,
    });

    await updateUserProfile(req.user._id, amount, currency);

    await processTransactionFeedback({
      user: req.user._id,
      success: true,
      fraud: false,
      fraudDecision: fraudResult?.decision || "APPROVE",
      amount,
      provider: providerUsed,
    });

    console.log("💾 Transaction complete");

    res.json({
      status: "completed",
      provider: providerUsed,
      latency: result.latency,
      balance: updatedUser.balance,
      fraud: fraudResult,
    });
  } catch (error) {
    console.log("🔥 FULL ERROR:", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

router.get("/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  res.json(data);
});

router.get("/intelligence", async (req, res) => {
  const stats = await getProviderStats();
  res.json(stats);
});

router.get("/fraud-logs", auth, async (req, res) => {
  const logs = await FraudLog.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  res.json(logs);
});

module.exports = router;