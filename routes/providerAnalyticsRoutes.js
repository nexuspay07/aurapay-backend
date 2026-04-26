const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const Transaction = require("../models/Transaction");

router.get("/", auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id });

    const providers = ["Stripe", "PayPal"];
    const analytics = {};

    for (const provider of providers) {
      const providerTx = transactions.filter(
        (tx) =>
          String(tx.provider || "").toLowerCase() === provider.toLowerCase()
      );

      const totalCount = providerTx.length;
      const successCount = providerTx.filter((tx) => tx.success === true).length;

      const totalVolume = providerTx.reduce(
        (sum, tx) => sum + Number(tx.amount || 0),
        0
      );

      const latencyValues = providerTx
        .map((tx) => Number(tx.latency || 0))
        .filter((v) => !Number.isNaN(v));

      const avgLatency =
        latencyValues.length > 0
          ? latencyValues.reduce((sum, v) => sum + v, 0) / latencyValues.length
          : 0;

      const successRate =
        totalCount > 0 ? (successCount / totalCount) * 100 : 0;

      const reliabilityScore =
        successRate - avgLatency / 100;

      analytics[provider] = {
        totalCount,
        successCount,
        totalVolume,
        avgLatency,
        successRate,
        reliabilityScore,
      };
    }

    const totalTransactions = transactions.length;

    const totalAttempts = transactions.reduce(
      (sum, tx) => sum + Number(tx.attempts || 1),
      0
    );

    const fallbackTransactions = transactions.filter(
      (tx) => Number(tx.attempts || 1) > 1
    );

    const fallbackRate =
      totalTransactions > 0
        ? (fallbackTransactions.length / totalTransactions) * 100
        : 0;

    const avgAttempts =
      totalTransactions > 0 ? totalAttempts / totalTransactions : 0;

    const mostUsedProvider =
      analytics.Stripe.totalCount >= analytics.PayPal.totalCount
        ? "Stripe"
        : "PayPal";

    const fastestProvider =
      analytics.Stripe.avgLatency <= analytics.PayPal.avgLatency
        ? "Stripe"
        : "PayPal";

    const recommendedProvider =
      analytics.Stripe.reliabilityScore >= analytics.PayPal.reliabilityScore
        ? "Stripe"
        : "PayPal";

    res.json({
      analytics,
      recommendedProvider,
      routingPerformance: {
        totalTransactions,
        fallbackCount: fallbackTransactions.length,
        fallbackRate,
        avgAttempts,
        mostUsedProvider,
        fastestProvider,
      },
    });
  } catch (err) {
    console.error("❌ PROVIDER ANALYTICS ERROR:", err);
    res.status(500).json({
      error: err.message || "Failed to load provider analytics",
    });
  }
});

module.exports = router;