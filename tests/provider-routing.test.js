const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AUTO_POLICY_ID,
  ProviderRoutingService,
  providerRoutingService,
} = require("../services/providerRoutingService");
const { UnsupportedProviderError } = require("../services/providers/providerRegistry");

test("auto routing follows the deterministic sandbox demonstration policy", () => {
  const cases = [
    ["CAD", "aurapay_sandbox", "sandbox_demo_cad"],
    ["USD", "stripe_sandbox", "sandbox_demo_usd"],
    ["EUR", "paypal_sandbox", "sandbox_demo_fallback"],
  ];

  for (const [currency, selectedProvider, reason] of cases) {
    const first = providerRoutingService.route({ requestedProvider: "auto", currency });
    const second = providerRoutingService.route({ requestedProvider: "auto", currency });

    assert.deepEqual(first, {
      mode: "auto",
      requestedProvider: "auto",
      selectedProvider,
      policy: AUTO_POLICY_ID,
      reason,
    });
    assert.deepEqual(second, first);
    assert.equal(Object.isFrozen(first), true);
  }
});

test("omitted and explicit providers preserve explicit sandbox selection", () => {
  const omitted = providerRoutingService.route({ currency: "USD" });
  assert.deepEqual(omitted, {
    mode: "explicit",
    requestedProvider: "aurapay_sandbox",
    selectedProvider: "aurapay_sandbox",
    policy: "explicit_v1",
    reason: "explicit_provider",
  });

  for (const provider of ["aurapay_sandbox", "stripe_sandbox", "paypal_sandbox"]) {
    const decision = providerRoutingService.route({ requestedProvider: provider, currency: "CAD" });
    assert.equal(decision.mode, "explicit");
    assert.equal(decision.requestedProvider, provider);
    assert.equal(decision.selectedProvider, provider);
  }
});

test("the external Stripe sandbox is explicit-only and does not alter auto routing", () => {
  const resolved = [];
  const registry = {
    resolve(providerId) {
      resolved.push(providerId);
      return { id: providerId };
    },
  };
  const service = new ProviderRoutingService(registry);

  const explicit = service.route({
    requestedProvider: "stripe_external_sandbox",
    currency: "USD",
  });
  assert.deepEqual(explicit, {
    mode: "explicit",
    requestedProvider: "stripe_external_sandbox",
    selectedProvider: "stripe_external_sandbox",
    policy: "explicit_v1",
    reason: "explicit_provider",
  });

  const automatic = service.route({ requestedProvider: "auto", currency: "USD" });
  assert.equal(automatic.selectedProvider, "stripe_sandbox");
  assert.deepEqual(resolved, ["stripe_external_sandbox", "stripe_sandbox"]);
});

test("real and unknown provider IDs remain unsupported", () => {
  for (const provider of ["stripe", "paypal", "unknown_provider"]) {
    assert.throws(
      () => providerRoutingService.route({ requestedProvider: provider, currency: "CAD" }),
      UnsupportedProviderError
    );
  }
});

test("auto is routing intent and is never resolved as an adapter", () => {
  const resolved = [];
  const registry = {
    resolve(providerId) {
      resolved.push(providerId);
      if (providerId === "auto") throw new Error("auto must not reach the registry");
      return { id: providerId };
    },
  };
  const service = new ProviderRoutingService(registry);

  const decision = service.route({ requestedProvider: "auto", currency: "USD" });
  assert.equal(decision.selectedProvider, "stripe_sandbox");
  assert.deepEqual(resolved, ["stripe_sandbox"]);
  assert.deepEqual(Object.keys(decision), [
    "mode",
    "requestedProvider",
    "selectedProvider",
    "policy",
    "reason",
  ]);
});
