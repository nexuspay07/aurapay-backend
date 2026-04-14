const { getProviderStats } = require("./metricsService");

// ✅ READ FROM ENV (SAFE)
const FORCE_MODE = process.env.FORCE_MODE === "true";

async function chooseBestProvider(currency) {
  const stats = await getProviderStats();

  if (!stats || stats.length === 0) {
    console.log("⚠️ No stats available, defaulting to Stripe");
    return "Stripe";
  }

  // 🧠 SCORE PROVIDERS
  const scored = stats.map(p => {
    const successRate = p.successRate || 0;
    const latency = p.avgLatency || 1000;

    const score =
      successRate * 1.0 -        // reward success
      latency / 1000 * 0.5;      // penalize latency

    return {
      provider: p.provider,
      score,
      successRate,
      avgLatency: latency,
      penalty: 0
    };
  });

  console.log("🧠 Scored Providers (AI):", scored);

  // 🔥 FORCE MODE (TESTING)
  if (FORCE_MODE) {
    const random = scored[Math.floor(Math.random() * scored.length)];
    console.log("⚡ FORCE MODE PICK:", random.provider);
    return random.provider;
  }

  // 🧠 NORMAL MODE → PICK BEST SCORE
  scored.sort((a, b) => b.score - a.score);

  return scored[0].provider;
}

module.exports = { chooseBestProvider };