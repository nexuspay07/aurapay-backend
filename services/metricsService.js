const Transaction = require("../models/Transaction");

async function getProviderStats() {
  try {
    const data = await Transaction.aggregate([
      {
        $match: {
          provider: { $exists: true, $ne: null }, // ✅ ignore bad records
        },
      },
      {
        $group: {
          _id: "$provider",
          total: { $sum: 1 },
          successCount: {
            $sum: {
              $cond: [{ $eq: ["$success", true] }, 1, 0],
            },
          },
          avgLatency: { $avg: "$latency" },
        },
      },
    ]);

    // ⚠️ No data fallback
    if (!data || data.length === 0) {
      console.log("⚠️ No provider stats found, using defaults");

      return [
        { provider: "Stripe", successRate: 1, avgLatency: 1000 },
        { provider: "PayPal", successRate: 1, avgLatency: 1000 },
      ];
    }

    const formatted = data.map((p) => ({
      provider: p._id || "Unknown", // ✅ safety fallback
      successRate:
        p.total && p.total > 0 ? p.successCount / p.total : 0,
      avgLatency: p.avgLatency || 1000,
    }));

    return formatted;
  } catch (err) {
    console.log("🔥 Metrics Error:", err.message);

    // 🚨 HARD FAIL SAFE (never break routing)
    return [
      { provider: "Stripe", successRate: 1, avgLatency: 1000 },
      { provider: "PayPal", successRate: 1, avgLatency: 1000 },
    ];
  }
}

module.exports = { getProviderStats };