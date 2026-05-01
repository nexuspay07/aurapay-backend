function calculateProfit({ amount, providerFee }) {
  const normalizedAmount = Number(amount || 0);
  const normalizedProviderFee = Number(providerFee || 0);

  const platformFeeRate = 0.01; // 1%
  const platformFee = Number((normalizedAmount * platformFeeRate).toFixed(2));

  const estimatedProfit = Number((platformFee - normalizedProviderFee).toFixed(2));

  const profitMargin =
    normalizedAmount > 0
      ? Number(((estimatedProfit / normalizedAmount) * 100).toFixed(2))
      : 0;

  return {
    platformFeeRate,
    platformFee,
    providerFee: normalizedProviderFee,
    estimatedProfit,
    profitMargin,
  };
}

module.exports = {
  calculateProfit,
};