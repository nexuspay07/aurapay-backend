function convert(amount, from, to) {
  if (from === to) return amount;

  const rates = {
    usd: { eur: 0.92 },
    eur: { usd: 1.09 },
  };

  const lowerFrom = String(from).toLowerCase();
  const lowerTo = String(to).toLowerCase();

  const rate = rates[lowerFrom]?.[lowerTo];

  if (!rate) {
    throw new Error(`Unsupported conversion: ${from} -> ${to}`);
  }

  return amount * rate;
}

module.exports = { convert };