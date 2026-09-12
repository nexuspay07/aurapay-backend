const CATALOG = {
  success: {
    title: "Payment completed",
    category: "success",
    stage: "authorization",
    explanation: "The sandbox simulation completed the simulated authorization successfully.",
    suggestedAction: "No action is required. Use the sandbox identifiers below for integration testing.",
  },
  card_declined: {
    title: "Card declined",
    category: "declined",
    stage: "authorization",
    explanation: "The sandbox simulation produced a card-declined authorization result. No real issuer was contacted.",
    suggestedAction: "Use another sandbox scenario or simulate another payment method result.",
  },
  insufficient_funds: {
    title: "Insufficient funds",
    category: "insufficient_funds",
    stage: "authorization",
    explanation: "The sandbox authorization simulation rejected the payment because the simulated available funds were insufficient.",
    suggestedAction: "Use another sandbox scenario or test with a successful authorization scenario.",
  },
  payment_processing: {
    title: "Payment processing",
    category: "pending",
    stage: "authorization",
    explanation: "The sandbox simulation recorded the payment as still processing. No real funds are moving.",
    suggestedAction: "Inspect the payment state while testing; AuraPay has not recorded a final outcome.",
  },
  payment_failed: {
    title: "Payment failed",
    category: "failed",
    stage: "authorization",
    explanation: "AuraPay recorded a generic sandbox payment failure.",
    suggestedAction: "Try a documented sandbox scenario and inspect the resulting lifecycle.",
  },
};

function outcomeCode(transaction) {
  const raw = transaction.rawProviderResponse?.code;
  if (raw === "payment_completed") return "success";
  if (raw && CATALOG[String(raw)]) return String(raw);
  if (raw) return transaction.status === "pending" ? "payment_processing" : "payment_failed";
  if (transaction.sandboxScenario === "success" || transaction.status === "completed") return "success";
  if (transaction.sandboxScenario === "declined") return "card_declined";
  if (transaction.sandboxScenario === "pending") return "payment_processing";
  return transaction.sandboxScenario || "payment_failed";
}

function describeOutcome(transaction) {
  const code = outcomeCode(transaction);
  return {
    code,
    ...(CATALOG[code] || {
      title: transaction.status === "pending" ? "Payment pending" : "Payment failed",
      category: transaction.status === "pending" ? "pending" : "failed",
      stage: "unknown",
      explanation: transaction.status === "pending"
        ? "AuraPay recorded a sandbox payment that has not reached a final state."
        : "AuraPay recorded a sandbox payment failure. Further outcome detail is unavailable.",
      suggestedAction: "Review the sandbox scenario and payment identifiers, then retry with a documented scenario.",
    }),
  };
}

module.exports = { describeOutcome, outcomeCode };
