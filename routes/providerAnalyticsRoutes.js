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
        (tx) => String(tx.provider || "").toLowerCase() === provider.toLowerCase()
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

      analytics[provider] = {
        totalCount,
        successCount,
        totalVolume,
        avgLatency,
        successRate,
      };
    }

    // ✅ Simple recommendation logic
    let recommendedProvider = "Stripe";

    const stripeScore =
      (analytics.Stripe?.successRate || 0) - (analytics.Stripe?.avgLatency || 0) / 1000;

    const paypalScore =
      (analytics.PayPal?.successRate || 0) - (analytics.PayPal?.avgLatency || 0) / 1000;

    if (paypalScore > stripeScore) {
      recommendedProvider = "PayPal";
    }

    res.json({
      analytics,
      recommendedProvider,
    });
  } catch (err) {
    console.error("❌ PROVIDER ANALYTICS ERROR:", err);
    res.status(500).json({
      error: err.message || "Failed to load provider analytics",
    });
  }
});

module.exports = router;