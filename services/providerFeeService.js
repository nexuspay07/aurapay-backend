function estimateProviderFee(provider, amount, currency = "usd") {
  const normalizedProvider = String(provider || "").toLowerCase();
  const normalizedAmount = Number(amount || 0);

  if (!normalizedAmount || normalizedAmount <= 0) {
    return {
      provider,
      amount: normalizedAmount,
      currency,
      fee: 0,
      netAmount: 0,
      feeRate: 0,
      fixedFee: 0,
    };
  }

  let feeRate = 0;
  let fixedFee = 0;

  if (normalizedProvider === "stripe") {
    feeRate = 0.029;
    fixedFee = 0.3;
  }

  if (normalizedProvider === "paypal") {
    feeRate = 0.0349;
    fixedFee = 0.49;
  }

  const fee = Number((normalizedAmount * feeRate + fixedFee).toFixed(2));
  const netAmount = Number((normalizedAmount - fee).toFixed(2));

  return {
    provider,
    amount: normalizedAmount,
    currency,
    fee,
    netAmount,
    feeRate,
    fixedFee,
  };
}

module.exports = {
  estimateProviderFee,
};