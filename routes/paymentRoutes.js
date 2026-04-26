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
const { applyDefense } = require("../services/defenseService");

const round = (num) => Math.round(num * 100) / 100;
const MAX_PAYMENT_LIMIT = 10000;

// ==================================================
// PHASE 36 — DYNAMIC RECENCY-BASED PROVIDER RANKING
// ==================================================
async function getDynamicProviderOrder(userId, amount) {
  const recentTx = await Transaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(50);

  const providers = ["Stripe", "PayPal"];

  const ranked = providers.map((provider) => {
    const txs = recentTx.filter(
      (tx) =>
        String(tx.provider || "").toLowerCase() === provider.toLowerCase()
    );

    if (txs.length === 0) {
      let coldStartScore = 50;

      if (amount >= 1000 && provider === "PayPal") coldStartScore += 5;
      if (amount < 1000 && provider === "Stripe") coldStartScore += 5;

      return {
        provider,
        score: coldStartScore,
        successRate: 0,
        avgLatency: 0,
        count: 0,
        reason: "No recent data yet. Using cold-start routing preference.",
      };
    }

    const successRate =
      txs.filter((tx) => tx.success === true).length / txs.length;

    const avgLatency =
      txs.reduce((sum, tx) => sum + Number(tx.latency || 0), 0) / txs.length;

    let score = successRate * 100 - avgLatency / 100;

    const reasons = [
      `Recent success rate: ${(successRate * 100).toFixed(1)}%`,
      `Recent average latency: ${avgLatency.toFixed(0)} ms`,
    ];

    if (amount >= 1000 && provider === "PayPal") {
      score += 5;
      reasons.push("Large-amount routing bonus applied.");
    }

    if (amount < 1000 && provider === "Stripe") {
      score += 5;
      reasons.push("Small-amount speed bonus applied.");
    }

    return {
      provider,
      score,
      successRate: successRate * 100,
      avgLatency,
      count: txs.length,
      reason: reasons.join(" "),
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  return {
    providerOrder: ranked.map((item) => item.provider),
    rankedProviders: ranked,
    recommendedProvider: ranked[0]?.provider || "Stripe",
    reasonSummary:
      ranked[0]?.reason ||
      "Provider selected using recent transaction performance.",
  };
}

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
    // BASIC PRODUCTION SAFETY
    // ==================================================
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!["usd", "eur"].includes(currency)) {
      return res.status(400).json({ error: "Unsupported currency" });
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
    // FRAUD DETECTION
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

    // ==================================================
    // BALANCE CHECK
    // ==================================================
    let usedConverted = false;
    const currentBalance = currency === "usd" ? currentUsd : currentEur;

    if (currentBalance < amount) {
      const otherCurrency = currency === "usd" ? "eur" : "usd";
      const otherBalance = otherCurrency === "usd" ? currentUsd : currentEur;
      const converted = convert(otherBalance, otherCurrency, currency);

      if (converted >= amount) {
        const needed = round(convert(amount, currency, otherCurrency));

        await User.findByIdAndUpdate(req.user._id, {
          $inc: { [`balance.${otherCurrency}`]: -needed },
        });

        usedConverted = true;
      } else {
        return res.status(400).json({ error: "Insufficient balance" });
      }
    }

    // ==================================================
    // PHASE 36 — DYNAMIC ROUTING + FALLBACK
    // ==================================================
    const routingExplanation = await getDynamicProviderOrder(
      req.user._id,
      amount
    );

    const providerOrder = routingExplanation.providerOrder;
    const providers = providerOrder.map((provider) =>
      provider.toLowerCase()
    );

    console.log("🧠 Phase 36 provider order:", providerOrder);
    console.log("🧠 Phase 36 routing explanation:", routingExplanation);

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
          providerUsed = provider === "paypal" ? "PayPal" : "Stripe";
          console.log(`✅ SUCCESS via ${providerUsed}`);
          break;
        }

        lastError = result?.error || "Unknown provider failure";
      } catch (err) {
        console.log(`❌ ${provider} failed:`, err.message);
        lastError = err.message;
      }
    }

    // ==================================================
    // ALL PROVIDERS FAILED
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
        routing: routingExplanation,
      });
    }

    // ==================================================
    // FINAL DEDUCTION
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
      recommendedProvider: routingExplanation.recommendedProvider,
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
      attempts,
      rankingUsed: providers,
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
  try {
    const stats = await Transaction.aggregate([
      {
        $addFields: {
          normalizedProvider: {
            $cond: [
              { $eq: [{ $toLower: "$provider" }, "paypal"] },
              "PayPal",
              {
                $cond: [
                  { $eq: [{ $toLower: "$provider" }, "stripe"] },
                  "Stripe",
                  "Unknown",
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$normalizedProvider",
          totalPayments: { $sum: 1 },
          successCount: {
            $sum: {
              $cond: [{ $eq: ["$success", true] }, 1, 0],
            },
          },
          avgLatency: { $avg: "$latency" },
          totalVolume: { $sum: "$amount" },
        },
      },
      {
        $project: {
          _id: 0,
          provider: "$_id",
          totalPayments: 1,
          totalVolume: 1,
          successRate: {
            $cond: [
              { $gt: ["$totalPayments", 0] },
              {
                $multiply: [
                  { $divide: ["$successCount", "$totalPayments"] },
                  100,
                ],
              },
              0,
            ],
          },
          avgLatency: { $round: ["$avgLatency", 0] },
        },
      },
      {
        $match: {
          provider: { $ne: "Unknown" },
        },
      },
      {
        $sort: { totalPayments: -1 },
      },
    ]);

    res.json(stats);
  } catch (err) {
    console.log("❌ INTELLIGENCE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/fraud-logs", auth, async (req, res) => {
  const logs = await FraudLog.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  res.json(logs);
});

module.exports = router;