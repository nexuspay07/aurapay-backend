const rates = {
  USD_EUR: 0.86,
  EUR_USD: 1.16,
};

function convert(amount, from, to) {
  if (from === to) return amount;

  const key = `${from.toUpperCase()}_${to.toUpperCase()}`;
  const rate = rates[key];

  if (!rate) {
    throw new Error("Conversion rate not available");
  }

  return amount * rate;
}

module.exports = { convert };