console.log("🔥 paymentRoutes LOADED");

const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const User = require("../models/User");
const FraudLog = require("../models/FraudLog");
const LedgerEntry = require("../models/LedgerEntry");

const auth = require("../middlewares/auth");

const { createLedgerEntry } = require("../services/ledgerService");
const { payWithStripe } = require("../services/stripeService");
const { payWithPayPal } = require("../services/paypalService");
const { convert } = require("../services/fxservice");
const { calculateProfit } = require("../services/profitService");

const { detectFraud } = require("../services/fraudService");
const { estimateProviderFee } = require("../services/providerFeeService");
const { updateUserProfile } = require("../services/riskProfileService");
const { processTransactionFeedback } = require("../services/feedbackService");
const { applyDefense } = require("../services/defenseService");

const round = (num) => Math.round(num * 100) / 100;
const MAX_PAYMENT_LIMIT = 10000;

function normalizeStatus(providerStatus) {
  if (providerStatus === "succeeded") return "completed";
  if (providerStatus === "failed") return "failed";
  return "completed";
}

async function getDynamicProviderOrder(userId, amount, currency = "usd", userProfile = {}) {
  const recentTx = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(50);

  const providers = ["Stripe", "PayPal"];
  const now = Date.now();
  const userRiskLevel = userProfile?.riskLevel || "low";

  const ranked = providers.map((provider) => {
    const txs = recentTx.filter(
      (tx) => String(tx.provider || "").toLowerCase() === provider.toLowerCase()
    );

    const feeEstimate = estimateProviderFee(provider, amount, currency);
    const costScore = Math.max(0, 50 - feeEstimate.fee);

    const platformFeeRate = 0.01;
    const platformFee = amount * platformFeeRate;
    const estimatedProfit = platformFee - feeEstimate.fee;

    const PROFIT_WEIGHT = 2;
    let profitScore = estimatedProfit * PROFIT_WEIGHT;

    if (profitScore > 100) profitScore = 100;
    if (profitScore < -100) profitScore = -100;

    if (txs.length === 0) {
      const reliabilityScore = 40;
      const speedScore = 40;
      const confidenceScore = 0;
      const historyScore = 0;

      let riskScore = 0;
      let amountScore = 0;

      if (userRiskLevel === "high" && provider === "PayPal") riskScore += 20;
      if (userRiskLevel === "low" && provider === "Stripe") riskScore += 10;
      if (amount >= 1000 && provider === "PayPal") amountScore += 15;
      if (amount < 1000 && provider === "Stripe") amountScore += 20;

      const score =
        reliabilityScore +
        speedScore +
        confidenceScore +
        riskScore +
        amountScore +
        historyScore +
        costScore +
        profitScore;

      return {
        provider,
        score,
        successRate: "0.0",
        avgLatency: "0",
        confidence: "0.00",
        count: 0,
        estimatedFee: feeEstimate.fee,
        estimatedNet: feeEstimate.netAmount,
        costScore: costScore.toFixed(1),
        estimatedProfit: Number(estimatedProfit.toFixed(2)),
        profitScore: profitScore.toFixed(1),
        reason: [
          "No user-specific data. Using cold-start profit-aware routing.",
          `Reliability: ${reliabilityScore.toFixed(1)}`,
          `Speed Score: ${speedScore.toFixed(1)}`,
          `Confidence: ${confidenceScore.toFixed(1)}`,
          `Risk Score: ${riskScore}`,
          `Amount Score: ${amountScore}`,
          `History Score: ${historyScore}`,
          `Estimated Fee: $${feeEstimate.fee}`,
          `Estimated Net: $${feeEstimate.netAmount}`,
          `Cost Score: ${costScore.toFixed(1)}`,
          `Profit: ${estimatedProfit.toFixed(2)}`,
          `Profit Score: ${profitScore.toFixed(1)}`,
        ].join(" | "),
      };
    }

    let weightedSuccess = 0;
    let weightedLatency = 0;
    let totalWeight = 0;

    txs.forEach((tx) => {
      const createdAt = tx.createdAt ? new Date(tx.createdAt).getTime() : now;
      const ageMinutes = Math.max(0, (now - createdAt) / (1000 * 60));
      const weight = Math.exp(-ageMinutes / 60);

      totalWeight += weight;
      if (tx.success === true) weightedSuccess += weight;
      weightedLatency += weight * Number(tx.latency || 0);
    });

    const successRate = totalWeight > 0 ? weightedSuccess / totalWeight : 0;
    const avgLatency = totalWeight > 0 ? weightedLatency / totalWeight : 0;
    const confidence = Math.min(1, txs.length / 10);

    const reliabilityScore = successRate * 100;
    const speedScore = Math.max(0, 100 - avgLatency / 10);
    const confidenceScore = confidence * 50;

    let riskScore = 0;
    if (userRiskLevel === "high" && provider === "PayPal") riskScore += 20;
    if (userRiskLevel === "low" && provider === "Stripe") riskScore += 10;

    let amountScore = 0;
    if (amount >= 1000 && provider === "PayPal") amountScore += 15;
    if (amount < 1000 && provider === "Stripe") amountScore += 20;

    const userSuccessWithProvider = txs.filter((tx) => tx.success === true).length;

    let historyScore = 0;
    if (userSuccessWithProvider >= 3) historyScore += 5;

    const score =
      reliabilityScore +
      speedScore +
      confidenceScore +
      riskScore +
      amountScore +
      historyScore +
      costScore +
      profitScore;

    return {
      provider,
      score,
      successRate: (successRate * 100).toFixed(1),
      avgLatency: avgLatency.toFixed(0),
      confidence: confidence.toFixed(2),
      count: txs.length,
      estimatedFee: feeEstimate.fee,
      estimatedNet: feeEstimate.netAmount,
      costScore: costScore.toFixed(1),
      estimatedProfit: Number(estimatedProfit.toFixed(2)),
      profitScore: profitScore.toFixed(1),
      reason: [
        `Reliability: ${reliabilityScore.toFixed(1)}`,
        `Speed Score: ${speedScore.toFixed(1)}`,
        `Confidence: ${confidenceScore.toFixed(1)}`,
        `Risk Score: ${riskScore}`,
        `Amount Score: ${amountScore}`,
        `History Score: ${historyScore}`,
        `Estimated Fee: $${feeEstimate.fee}`,
        `Estimated Net: $${feeEstimate.netAmount}`,
        `Cost Score: ${costScore.toFixed(1)}`,
        `Profit: ${estimatedProfit.toFixed(2)}`,
        `Profit Score: ${profitScore.toFixed(1)}`,
        `Recent success rate: ${(successRate * 100).toFixed(1)}%`,
        `Recent avg latency: ${avgLatency.toFixed(0)} ms`,
      ].join(" | "),
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  return {
    providerOrder: ranked.map((item) => item.provider),
    rankedProviders: ranked,
    recommendedProvider: ranked[0]?.provider || "Stripe",
    reasonSummary:
      "Profit-aware multi-objective routing applied: reliability + speed + confidence + risk + amount + fees + profit.",
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

  try {
    const amount = Number(req.body.amount);
    const currency = String(req.body.currency || "").toLowerCase();

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

    const fraudResult = await detectFraud(req.user, {
      ...req.body,
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

    const routingExplanation = await getDynamicProviderOrder(
      req.user._id,
      amount,
      currency,
      req.user
    );

    const providerOrder = routingExplanation.providerOrder;
    const providers = providerOrder.map((provider) => provider.toLowerCase());

    console.log("🧠 Provider order:", providerOrder);

    let lastError = null;
    let result = null;
    let providerUsed = null;
    let attempts = 0;

    for (const provider of providers) {
      attempts += 1;

      try {
        console.log(`🚀 Trying provider: ${provider}`);

        if (provider === "stripe") {
          result = await payWithStripe({ amount, currency });
        } else if (provider === "paypal") {
          result = await payWithPayPal({ amount, currency });
        } else {
          result = { success: false, error: `Unsupported provider: ${provider}` };
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

    const selectedProviderFee =
      routingExplanation.rankedProviders.find((item) => item.provider === providerUsed) ||
      null;

    const profitData = calculateProfit({
      amount,
      providerFee: selectedProviderFee?.estimatedFee || 0,
    });

    const balanceBeforeUser = await User.findById(req.user._id);
    const balanceBefore = Number(balanceBeforeUser.balance?.[currency] || 0);

    if (!usedConverted) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { [`balance.${currency}`]: -amount },
      });
    }

    const updatedUser = await User.findById(req.user._id);
    const balanceAfter = Number(updatedUser.balance?.[currency] || 0);

    const transaction = await Transaction.create({
      user: req.user._id,
      amount,
      currency,
      provider: providerUsed,
      transactionId: result.id || null,
      providerPaymentId: result.id || null,
      status: normalizeStatus(result.status),
      latency: result.latency || 0,
      attempts,
      errorMessage: result.error || null,
      success: true,
      paymentType: providerUsed === "Stripe" ? "stripe" : "paypal",

      recommendedProvider: routingExplanation.recommendedProvider,
      attemptOrder: providerOrder,
      selectionMode: "auto",

      estimatedFee: selectedProviderFee?.estimatedFee || 0,
      estimatedNet: selectedProviderFee?.estimatedNet || amount,
      costScore: selectedProviderFee?.costScore || "0.0",
      estimatedProviderProfit: selectedProviderFee?.estimatedProfit || 0,
      providerProfitScore: selectedProviderFee?.profitScore || "0.0",

      platformFee: profitData.platformFee,
      estimatedProfit: profitData.estimatedProfit,
      profitMargin: profitData.profitMargin,

      rawProviderResponse: result,
      confirmedAt: new Date(),
    });

    await createLedgerEntry({
      user: req.user._id,
      transaction: transaction._id,
      type: "debit",
      account: "wallet",
      amount,
      currency,
      provider: providerUsed,
      balanceBefore,
      balanceAfter,
      description: `Transfer via ${providerUsed}`,
      metadata: {
        transactionId: transaction._id,
        providerPaymentId: result.id || null,
        routing: routingExplanation,
      },
    });

    await createLedgerEntry({
      user: req.user._id,
      transaction: transaction._id,
      type: "credit",
      account: "provider_settlement",
      amount,
      currency,
      provider: providerUsed,
      balanceBefore: 0,
      balanceAfter: amount,
      description: `Provider settlement via ${providerUsed}`,
      metadata: {
        transactionId: transaction._id,
        providerPaymentId: result.id || null,
      },
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

    return res.json({
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

      estimatedFee: selectedProviderFee?.estimatedFee || 0,
      estimatedNet: selectedProviderFee?.estimatedNet || amount,
      costScore: selectedProviderFee?.costScore || "0.0",
      estimatedProviderProfit: selectedProviderFee?.estimatedProfit || 0,
      providerProfitScore: selectedProviderFee?.profitScore || "0.0",

      profit: profitData,

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
    return res.status(500).json({
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

router.get("/ledger", auth, async (req, res) => {
  try {
    const entries = await LedgerEntry.find({
      user: req.user._id,
    }).sort({
      createdAt: -1,
    });

    res.json(entries);
  } catch (err) {
    console.log("❌ Ledger fetch error:", err);
    res.status(500).json({ error: err.message });
  }
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
          totalEstimatedFees: { $sum: "$estimatedFee" },
          totalEstimatedNet: { $sum: "$estimatedNet" },
          totalPlatformFees: { $sum: "$platformFee" },
          totalEstimatedProfit: { $sum: "$estimatedProfit" },
        },
      },
      {
        $project: {
          _id: 0,
          provider: "$_id",
          totalPayments: 1,
          totalVolume: 1,
          totalEstimatedFees: 1,
          totalEstimatedNet: 1,
          totalPlatformFees: 1,
          totalEstimatedProfit: 1,
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