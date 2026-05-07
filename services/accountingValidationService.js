const LedgerEntry = require("../models/LedgerEntry");

async function validateDoubleEntry(transactionId) {
  const entries = await LedgerEntry.find({
    transaction: transactionId,
  });

  let debitTotal = 0;
  let creditTotal = 0;

  for (const entry of entries) {
    if (entry.type === "debit") {
      debitTotal += Number(entry.amount || 0);
    }

    if (entry.type === "credit") {
      creditTotal += Number(entry.amount || 0);
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