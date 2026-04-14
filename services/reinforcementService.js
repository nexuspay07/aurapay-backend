// /services/reinforcementService.js
const Transaction = require("../models/Transaction");

async function updateProviderScore(provider, success, latency) {
  const scoreChange = success ? 1 : -1;

  await Transaction.updateMany(
    { provider },
    { $inc: { penalty: success ? -1 : 1 } } // simple penalty/reward
  );

  return { provider, scoreChange, latency };
}

async function getProviderScores(context = {}) {
  const transactions = await Transaction.find(context);

  const providers = {};
  transactions.forEach(tx => {
    if (!providers[tx.provider]) providers[tx.provider] = { total: 0, success: 0, latency: 0, penalty: 0 };
    providers[tx.provider].total += 1;
    providers[tx.provider].success += tx.success ? 1 : 0;
    providers[tx.provider].latency += tx.latency || 0;
    providers[tx.provider].penalty += tx.errorMessage ? 1 : 0;
  });

  return Object.entries(providers).map(([provider, stats]) => ({
    provider,
    score: (stats.success / stats.total) - 0.1 * ((stats.latency || 0)/1000) - (stats.penalty || 0),
    successRate: stats.success / stats.total,
    avgLatency: stats.latency / stats.total,
    penalty: stats.penalty
  }));
}

module.exports = { updateProviderScore, getProviderScores };