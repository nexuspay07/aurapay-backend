const LedgerEntry = require("../models/LedgerEntry");

async function createLedgerEntry(data) {
  return await LedgerEntry.create({
    user: data.user,
    transaction: data.transaction || null,

    type: data.type,
    account: data.account,

    amount: data.amount,
    currency: data.currency,

    description: data.description || "",

    provider: data.provider || null,

    balanceBefore: data.balanceBefore || 0,
    balanceAfter: data.balanceAfter || 0,

    metadata: data.metadata || {},
  });
}

module.exports = {
  createLedgerEntry,
};