const AccountStatus = require("../models/AccountStatus");

async function checkRateLimit(user) {
  let status = await AccountStatus.findOne({ user: user._id });

  if (!status) {
    status = await AccountStatus.create({ user: user._id });
  }

  const now = Date.now();

  // Reset every 10 seconds
  if (!status.lastTransactionTime || now - status.lastTransactionTime > 10000) {
    status.transactionCountWindow = 1;
  } else {
    status.transactionCountWindow += 1;
  }

  status.lastTransactionTime = now;
  await status.save();

  if (status.transactionCountWindow > 5) {
    return {
      blocked: true,
      reason: "Too many requests (rate limit)",
    };
  }

  return { blocked: false };
}

module.exports = { checkRateLimit };