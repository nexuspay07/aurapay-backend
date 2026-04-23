function scoreProvider(providerName, stats, amount) {
  const providerStats = stats?.[providerName] || {};

  const successRate = Number(providerStats.successRate || 0);
  const avgLatency = Number(providerStats.avgLatency || 0);

  let score = 0;
  const reasons = [];

  // ✅ success rate matters most
  score += successRate * 2;
  reasons.push(`success rate contribution: ${successRate.toFixed(1)}%`);

  // ✅ lower latency is better
  const latencyPenalty = avgLatency / 100;
  score -= latencyPenalty;
  reasons.push(`latency penalty: ${avgLatency.toFixed(0)} ms`);

  // ✅ amount-aware logic
  if (amount >= 1000) {
    if (providerName === "PayPal") {
      score += 5;
      reasons.push("large-amount bonus applied");
    }
  } else {
    if (providerName === "Stripe") {
      score += 5;
      reasons.push("small-amount bonus applied");
    }
  }

  return {
    provider: providerName,
    score,
    reasons,
    successRate,
    avgLatency,
  };
}

function buildRoutingExplanation(stats, amount) {
  const providers = ["Stripe", "PayPal"];

  const ranked = providers
    .map((provider) => scoreProvider(provider, stats, amount))
    .sort((a, b) => b.score - a.score);

  const providerOrder = ranked.map((item) => item.provider);

  return {
    providerOrder,
    rankedProviders: ranked,
    recommendedProvider: ranked[0]?.provider || "Stripe",
    reasonSummary:
      amount >= 1000
        ? "Large payment routing favored providers optimized for higher-value transfers."
        : "Smaller payment routing favored faster providers.",
  };
}

module.exports = {
  buildRoutingExplanation,
};