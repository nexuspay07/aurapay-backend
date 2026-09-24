const {
  SANDBOX_PROVIDER_ID,
  UnsupportedProviderError,
  providerRegistry,
} = require("./providers/providerRegistry");

const AUTO_PROVIDER_ID = "auto";
const AUTO_POLICY_ID = "sandbox_demo_v1";
const EXPLICIT_POLICY_ID = "explicit_v1";

class ProviderRoutingService {
  constructor(registry = providerRegistry) {
    this.registry = registry;
  }

  route({ requestedProvider = SANDBOX_PROVIDER_ID, currency }) {
    if (requestedProvider !== AUTO_PROVIDER_ID) {
      const adapter = this.registry.resolve(requestedProvider);
      return Object.freeze({
        mode: "explicit",
        requestedProvider,
        selectedProvider: adapter.id,
        policy: EXPLICIT_POLICY_ID,
        reason: "explicit_provider",
      });
    }

    const normalizedCurrency = String(currency || "").trim().toUpperCase();
    let selectedProvider;
    let reason;

    if (normalizedCurrency === "CAD") {
      selectedProvider = SANDBOX_PROVIDER_ID;
      reason = "sandbox_demo_cad";
    } else if (normalizedCurrency === "USD") {
      selectedProvider = "stripe_sandbox";
      reason = "sandbox_demo_usd";
    } else if (/^[A-Z]{3}$/.test(normalizedCurrency)) {
      selectedProvider = "paypal_sandbox";
      reason = "sandbox_demo_fallback";
    } else {
      throw new UnsupportedProviderError(requestedProvider);
    }

    // The registry remains the final allowlist for every routing decision.
    const adapter = this.registry.resolve(selectedProvider);
    return Object.freeze({
      mode: "auto",
      requestedProvider: AUTO_PROVIDER_ID,
      selectedProvider: adapter.id,
      policy: AUTO_POLICY_ID,
      reason,
    });
  }
}

const providerRoutingService = new ProviderRoutingService();

module.exports = {
  AUTO_POLICY_ID,
  AUTO_PROVIDER_ID,
  EXPLICIT_POLICY_ID,
  ProviderRoutingService,
  providerRoutingService,
};
