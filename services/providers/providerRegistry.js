const { assertPaymentProvider } = require("./providerContract");
const { sandboxPaymentProvider } = require("./sandboxPaymentProvider");

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
const providerRegistry = new ProviderRegistry([sandboxPaymentProvider]);

module.exports = { ProviderRegistry, SANDBOX_PROVIDER_ID, UnsupportedProviderError, providerRegistry };
