const UserRiskProfile = require("../models/UserRiskProfile");

async function updateUserProfile(userId, amount, currency) {
  let profile = await UserRiskProfile.findOne({ user: userId });

  if (!profile) {
    profile = await UserRiskProfile.create({ user: userId });
  }

  // 📊 Update avg transaction
  const total = profile.totalTransactions;
  profile.avgAmount =
    (profile.avgAmount * total + amount) / (total + 1);

  profile.totalTransactions += 1;

  // 💱 Preferred currency
  if (profile.totalTransactions > 5) {
    profile.preferredCurrency = currency;
  }

  // ⚡ Velocity tracking
  const now = new Date();

  if (
    profile.lastTransactionTime &&
    now - profile.lastTransactionTime < 60000
  ) {
    profile.transactionsLastMinute += 1;
  } else {
    profile.transactionsLastMinute = 1;
  }

  profile.lastTransactionTime = now;

  await profile.save();

  return profile;
}

module.exports = { updateUserProfile };