const LedgerEntry = require("../models/LedgerEntry");

async function validateDoubleEntry(transactionId) {
  const entries = await LedgerEntry.find({
    transaction: transactionId,
  });

  let debitTotal = 0;
  let creditTotal = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount || 0);

    // Debit-side movements
    if (
      entry.type === "debit" ||
      entry.type === "refund" ||
      entry.type === "reversal"
    ) {
      debitTotal += amount;
    }

    // Credit-side movements
    if (entry.type === "credit") {
      creditTotal += amount;
    }
  }

  const balanced = debitTotal === creditTotal;

  return {
    balanced,
    debitTotal,
    creditTotal,
    difference: debitTotal - creditTotal,
    entriesCount: entries.length,
  };
}

module.exports = {
  validateDoubleEntry,
};