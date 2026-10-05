const { assertPaymentProvider } = require("./providerContract");
const { sandboxPaymentProvider } = require("./sandboxPaymentProvider");
const { stripeSandboxPaymentProvider } = require("./stripeSandboxPaymentProvider");
const { paypalSandboxPaymentProvider } = require("./paypalSandboxPaymentProvider");

function configuredAdapters(env = process.env) {
  const adapters = [
    sandboxPaymentProvider,
    stripeSandboxPaymentProvider,
    paypalSandboxPaymentProvider,
  ];

  if (env.STRIPE_EXTERNAL_SANDBOX_ENABLED === "true") {
    // Keep the Stripe SDK and client uninitialized unless explicitly enabled.
    const {
      createStripeExternalSandboxPaymentProviderFromEnvironment,
    } = require("./stripeExternalSandboxPaymentProvider");
    adapters.push(createStripeExternalSandboxPaymentProviderFromEnvironment({ env }));
  }

  return adapters;
}

class UnsupportedProviderError extends Error {
  constructor(providerId) {
    super(`Unsupported payment provider: ${providerId}`);
    this.name = "UnsupportedProviderError";
  }
}

class ProviderRegistry {
  constructor(adapters) {
    this.adapters = new Map(adapters.map((adapter) => {
      const verified = assertPaymentProvider(adapter);
      return [verified.id, verified];
    }));
  }

  resolve(providerId) {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new UnsupportedProviderError(providerId);
    return adapter;
  }
}

const SANDBOX_PROVIDER_ID = "aurapay_sandbox";
const providerRegistry = new ProviderRegistry(configuredAdapters());

module.exports = {
  ProviderRegistry,
  SANDBOX_PROVIDER_ID,
  UnsupportedProviderError,
  configuredAdapters,
  providerRegistry,
};
