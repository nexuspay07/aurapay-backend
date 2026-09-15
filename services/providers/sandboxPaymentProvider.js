const crypto = require("node:crypto");

const SCENARIOS = Object.freeze({
  success: Object.freeze({ status: "completed", success: true, code: "payment_completed", message: "Sandbox payment completed." }),
  declined: Object.freeze({ status: "failed", success: false, code: "card_declined", message: "Sandbox payment declined." }),
  insufficient_funds: Object.freeze({ status: "failed", success: false, code: "insufficient_funds", message: "Sandbox payment failed due to insufficient funds." }),
  pending: Object.freeze({ status: "pending", success: false, code: "payment_processing", message: "Sandbox payment is processing." }),
  failed: Object.freeze({ status: "failed", success: false, code: "payment_failed", message: "Sandbox payment failed." }),
});

const ALIASES = Object.freeze({
  successful: "success", succeed: "success", approved: "success", decline: "declined",
  card_declined: "declined", insufficient: "insufficient_funds", processing: "pending",
  generic_failed: "failed", generic_failure: "failed",
});

function normalizeScenario(value) {
  const key = String(value || "success").trim().toLowerCase();
  return SCENARIOS[key] ? key : ALIASES[key] || "success";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const sandboxPaymentProvider = {
  id: "aurapay_sandbox",
  getScenarios() {
    return Object.keys(SCENARIOS);
  },
  async executePayment({ amount, currency, scenario = "success" }) {
    const normalizedScenario = normalizeScenario(scenario);
    const outcome = SCENARIOS[normalizedScenario];
    return {
      provider: "aurapay_sandbox",
      providerPaymentId: `pay_test_${crypto.randomBytes(10).toString("hex")}`,
      status: outcome.status,
      success: outcome.success,
      outcome: { code: outcome.code, message: outcome.message },
      amount: roundMoney(amount),
      currency: String(currency || "USD").toUpperCase(),
      environment: "sandbox",
      livemode: false,
      metadata: { scenario: normalizedScenario },
    };
  },
};

module.exports = { SCENARIOS, normalizeScenario, sandboxPaymentProvider };
