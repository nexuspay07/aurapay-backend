console.log("🔥 paymentRoutes LOADED");

const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const User = require("../models/User");
const FraudLog = require("../models/FraudLog");

const auth = require("../middlewares/auth");

const { payWithStripe } = require("../services/stripeService");
const { payWithPayPal } = require("../services/paypalService");
const { convert } = require("../services/fxservice");

const { detectFraud } = require("../services/fraudService");
const { getProviderStats } = require("../services/metricsService");
const { updateUserProfile } = require("../services/riskProfileService");
const { processTransactionFeedback } = require("../services/feedbackService");
const { buildRoutingExplanation } = require("../services/dynamicRoutingService");
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
    const amount = Number(data.amount);
    const currency = String(data.currency || "").toLowerCase();

    // ==================================================
    // 🔒 BASIC PRODUCTION SAFETY
    // ==================================================

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
      });
    }

    if (!["usd", "eur"].includes(currency)) {
      return res.status(400).json({
        error: "Unsupported currency",
      });
    }

    if (amount > MAX_PAYMENT_LIMIT) {
      return res.status(400).json({
        error: `Amount exceeds maximum limit (${MAX_PAYMENT_LIMIT})`,
      });
    }

    if (!req.user.balance || typeof req.user.balance !== "object") {
      return res.status(400).json({
        error: "User wallet is not configured properly",
      });
    }

    const currentUsd = Number(req.user.balance.usd || 0);
    const currentEur = Number(req.user.balance.eur || 0);

    // ==================================================
    // 🛡️ FRAUD DETECTION
    // ==================================================
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

    // ==================================================
    // 💰 BALANCE CHECK
    // ==================================================
    let usedConverted = false;

    const currentBalance = currency === "usd" ? currentUsd : currentEur;

    if (currentBalance >= amount) {
      console.log("✅ Enough balance");
    } else {
      const otherCurrency = currency === "usd" ? "eur" : "usd";
      const otherBalance = otherCurrency === "usd" ? currentUsd : currentEur;

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

    // ==================================================
    // 🚀 AUTO ROUTING + FALLBACK
    // ==================================================
    const stats = await getProviderStats();
const routingExplanation = buildRoutingExplanation(stats, amount);
const providerOrder = routingExplanation.providerOrder;

console.log("🧠 Dynamic provider order:", providerOrder);
console.log("🧠 Routing explanation:", routingExplanation);

const providers = providerOrder.map((p) => p.toLowerCase());
    let lastError = null;
    let result = null;
    let providerUsed = null;
    let attempts = 0;

    for (const provider of providers) {
      attempts++;

      try {
        console.log(`🚀 Trying provider: ${provider}`);

        if (provider === "stripe") {
          result = await payWithStripe({ amount, currency });
        } else if (provider === "paypal") {
          result = await payWithPayPal({ amount, currency });
        }

        console.log(`📊 Result from ${provider}:`, result);

        if (result?.success) {
          providerUsed = provider.charAt(0).toUpperCase() + provider.slice(1);
          console.log(`✅ SUCCESS via ${providerUsed}`);
          break;
        }

        lastError = result?.error || "Unknown failure";
      } catch (err) {
        console.log(`❌ ${provider} failed:`, err.message);
        lastError = err.message;
      }
    }

    // ==================================================
    // ❌ ALL PROVIDERS FAILED
    // ==================================================
    if (!result?.success) {
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

      return res.status(500).json({
        success: false,
        error: "All providers failed",
        details: lastError,
      });
    }

    // ==================================================
    // 💰 FINAL DEDUCTION
    // ==================================================
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
      transactionId: result.id || null,
      status: result.status || "completed",
      latency: result.latency || 0,
      attempts,
      errorMessage: result.error || null,
      success: true,
      recommendedProvider: providerOrder[0],
attemptOrder: providerOrder,
selectionMode: "auto",
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
  success: true,
  status: "completed",
  provider: providerUsed,
  latency: result.latency || 0,
  transactionId: result.id || null,
  amount,
  currency,
  balance: updatedUser.balance,
  fraud: fraudResult,
  routing: {
    recommendedProvider: routingExplanation.recommendedProvider,
    selectedProvider: providerUsed,
    attemptOrder: providerOrder,
    rankedProviders: routingExplanation.rankedProviders,
    reasonSummary: routingExplanation.reasonSummary,
  },
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