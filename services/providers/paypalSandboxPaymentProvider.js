const crypto = require("node:crypto");

const SCENARIOS = Object.freeze({
  success: Object.freeze({
    status: "completed",
    success: true,
    code: "payment_completed",
    message: "PayPal sandbox payment completed.",
  }),
  declined: Object.freeze({
    status: "failed",
    success: false,
    code: "payment_declined",
    message: "PayPal sandbox payment declined.",
  }),
  insufficient_funds: Object.freeze({
    status: "failed",
    success: false,
    code: "insufficient_funds",
    message: "PayPal sandbox payment failed due to insufficient funds.",
  }),
  pending: Object.freeze({
    status: "pending",
    success: false,
    code: "payment_processing",
    message: "PayPal sandbox payment is processing.",
  }),
  failed: Object.freeze({
    status: "failed",
    success: false,
    code: "payment_failed",
    message: "PayPal sandbox payment failed.",
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

const paypalSandboxPaymentProvider = {
  id: "paypal_sandbox",

  getScenarios() {
    return Object.keys(SCENARIOS);
  },

  async executePayment({ amount, currency, scenario = "success" }) {
    const normalizedScenario = normalizeScenario(scenario);
    const outcome = SCENARIOS[normalizedScenario];

    return {
      provider: "paypal_sandbox",
      providerPaymentId: `pay_paypal_test_${crypto.randomBytes(10).toString("hex")}`,
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
  paypalSandboxPaymentProvider,
};