function item(key, label, state, timestamp, description, evidence) {
  return { key, label, state, timestamp: timestamp || null, description, evidence };
}

function buildPaymentTimeline({ transaction, outcome, settlement, events, webhookConfigured, deliveries, apiLog }) {
  const created = transaction.createdAt;
  const isFailed = transaction.status === "failed";
  const isPending = ["pending", "processing"].includes(transaction.status);
  const authorizationState = isFailed ? "failed" : isPending ? "pending" : "completed";
  const authorizationLabel = isFailed
    ? "Simulated authorization declined"
    : isPending ? "Payment processing" : "Simulated authorization successful";
  const relevantEvents = events.filter((event) => event.resourceType === "transaction");

  return [
    item("request_received", "Request received", "completed", apiLog?.createdAt || created,
      apiLog ? "AuraPay recorded the originating API request." : "Derived from the recorded transaction creation.", apiLog ? "recorded" : "inferred"),
    item("api_key_authenticated", "API key authenticated", "completed", apiLog?.createdAt || created,
      "The canonical payment request could not create this transaction without successful sandbox API-key authentication.", "inferred"),
    item("request_validated", "Request validated", "completed", apiLog?.createdAt || created,
      "The canonical payment request passed validation before simulation.", "inferred"),
    item("sandbox_simulation", "Sandbox simulation started", "completed", created,
      `AuraPay recorded sandbox scenario ${transaction.sandboxScenario || "unknown"}.`, "recorded"),
    item("authorization", authorizationLabel, authorizationState,
      transaction.failedAt || transaction.confirmedAt || created, outcome.explanation, "inferred"),
    item("transaction_recorded", "Transaction recorded", "completed", created,
      "AuraPay persisted this sandbox transaction.", "recorded"),
    item("settlement", settlement ? "Settlement created" : isPending ? "Settlement not created yet" : "Settlement not created",
      settlement ? "completed" : isPending ? "pending" : "skipped", settlement?.createdAt || null,
      settlement ? "AuraPay recorded a sandbox settlement for this transaction."
        : isPending ? "No settlement exists while the payment remains pending."
        : "Failed sandbox payments are not eligible for settlement.", settlement ? "recorded" : "inferred"),
    item("events", relevantEvents.length ? "Event generated" : "No payment event recorded",
      relevantEvents.length ? "completed" : "not_reached", relevantEvents[0]?.createdAt || null,
      relevantEvents.length ? `${relevantEvents.length} transaction event(s) are recorded.` : "No reliably correlated transaction event is available.", "recorded"),
    item("webhooks", deliveries.length ? "Webhook delivery attempted" : webhookConfigured ? "No correlated webhook attempt" : "No webhook destination configured",
      deliveries.length ? (deliveries.some((d) => d.status === "pending") ? "pending" : "completed") : "skipped",
      deliveries[0]?.createdAt || null,
      deliveries.length ? `${deliveries.length} correlated delivery attempt(s) are recorded.`
        : webhookConfigured ? "A destination exists, but no delivery record is correlated with this payment."
        : "No active merchant webhook destination was configured.", "recorded"),
  ];
}

module.exports = { buildPaymentTimeline };
