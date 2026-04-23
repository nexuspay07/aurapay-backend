function scoreProvider(providerName, stats, amount) {
  const providerStats = stats?.[providerName] || {};

  const successRate = Number(providerStats.successRate || 0); // higher is better
  const avgLatency = Number(providerStats.avgLatency || 0);   // lower is better

  let score = 0;

  // ✅ success rate matters most
  score += successRate * 2;

  // ✅ lower latency is better
  score -= avgLatency / 100;

  // ✅ simple amount-aware logic
  if (amount >= 1000) {
    if (providerName === "PayPal") score += 5;
  } else {
    if (providerName === "Stripe") score += 5;
  }

  return score;
}

function buildProviderOrder(stats, amount) {
  const providers = ["Stripe", "PayPal"];

  const ranked = providers
    .map((provider) => ({
      provider,
      score: scoreProvider(provider, stats, amount),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.map((item) => item.provider);
}

module.exports = {
  buildProviderOrder,
};