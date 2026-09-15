const PROVIDER_STATUSES = new Set(["completed", "failed", "pending"]);

// Phase 7 payment adapters implement executePayment(request) and return only the
// normalized fields admitted below. Provider-native payloads and credentials do
// not cross this boundary into AuraPay persistence, events, logs, or responses.

class InvalidProviderResultError extends Error {
  constructor(message) {
    super(`Invalid provider result: ${message}`);
    this.name = "InvalidProviderResultError";
  }
}

function assertPaymentProvider(adapter) {
  if (!adapter || typeof adapter.id !== "string" || !adapter.id.trim()) {
    throw new TypeError("Payment provider must declare a non-empty id.");
  }
  if (typeof adapter.executePayment !== "function") {
    throw new TypeError(`Payment provider "${adapter.id}" must implement executePayment(request).`);
  }
  return adapter;
}

function normalizeProviderResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new InvalidProviderResultError("expected an object.");
  }

  const provider = String(result.provider || "").trim();
  const providerPaymentId = String(result.providerPaymentId || "").trim();
  const status = String(result.status || "").trim();
  const outcomeCode = String(result.outcome?.code || "").trim();
  const outcomeMessage = String(result.outcome?.message || "").trim();
  const amount = Number(result.amount);
  const currency = String(result.currency || "").trim().toUpperCase();
  const environment = String(result.environment || "").trim();

  if (!provider) throw new InvalidProviderResultError("provider is required.");
  if (!providerPaymentId) throw new InvalidProviderResultError("providerPaymentId is required.");
  if (!PROVIDER_STATUSES.has(status)) throw new InvalidProviderResultError("status is unsupported.");
  if (typeof result.success !== "boolean") throw new InvalidProviderResultError("success must be boolean.");
  if ((status === "completed") !== result.success) throw new InvalidProviderResultError("success must match completed status.");
  if (!outcomeCode || !outcomeMessage) throw new InvalidProviderResultError("outcome code and message are required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new InvalidProviderResultError("amount must be greater than zero.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new InvalidProviderResultError("currency must be an ISO-style code.");
  if (environment !== "sandbox" || result.livemode !== false) {
    throw new InvalidProviderResultError("Phase 7 accepts sandbox results only.");
  }

  const metadata = result.metadata && typeof result.metadata === "object" && !Array.isArray(result.metadata)
    ? { scenario: String(result.metadata.scenario || "") }
    : { scenario: "" };
  if (!metadata.scenario) throw new InvalidProviderResultError("metadata.scenario is required.");

  return Object.freeze({
    provider,
    providerPaymentId,
    status,
    success: result.success,
    outcome: Object.freeze({ code: outcomeCode, message: outcomeMessage }),
    amount,
    currency,
    environment,
    livemode: false,
    metadata: Object.freeze(metadata),
  });
}

module.exports = { InvalidProviderResultError, assertPaymentProvider, normalizeProviderResult };
