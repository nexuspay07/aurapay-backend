function getAmountBucket(amount) {
  if (amount <= 100) return "SMALL";
  if (amount <= 1000) return "MEDIUM";
  return "LARGE";
}

module.exports = { getAmountBucket };