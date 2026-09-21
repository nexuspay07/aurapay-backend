const crypto = require("node:crypto");

const SCENARIOS = Object.freeze({
  success: Object.freeze({
    status: "completed",
    success: true,
    code: "payment_completed",
    message: "Stripe sandbox payment completed.",
  }),
  declined: Object.freeze({
    status: "failed",
    success: false,
    code: "card_declined",
    message: "Stripe sandbox payment declined.",
  }),
  insufficient_funds: Object.freeze({
    status: "failed",
    success: false,
    code: "insufficient_funds",
    message: "Stripe sandbox payment failed due to insufficient funds.",
  }),
  pending: Object.freeze({
    status: "pending",
    success: false,
    code: "payment_processing",
    message: "Stripe sandbox payment is processing.",
  }),
  failed: Object.freeze({
    status: "failed",
    success: false,
    code: "payment_failed",
    message: "Stripe sandbox payment failed.",
  }),
});

function normalizeScenario(value) {
  const scenario = String(value || "success").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SCENARIOS, scenario)
    ? scenario
    : "success";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const stripeSandboxPaymentProvider = {
  id: "stripe_sandbox",

  getScenarios() {
    return Object.keys(SCENARIOS);
  },

  async executePayment({ amount, currency, scenario = "success" }) {
    const normalizedScenario = normalizeScenario(scenario);
    const outcome = SCENARIOS[normalizedScenario];

    return {
      provider: "stripe_sandbox",
      providerPaymentId: `pay_stripe_test_${crypto.randomBytes(10).toString("hex")}`,
      status: outcome.status,
      success: outcome.success,
      outcome: {
        code: outcome.code,
        message: outcome.message,
      },
      amount: roundMoney(amount),
      currency: String(currency || "USD").toUpperCase(),
      environment: "sandbox",
      livemode: false,
      metadata: {
        scenario: normalizedScenario,
      },
    };
  },
};

module.exports = {
  stripeSandboxPaymentProvider,
};