const assert = require("node:assert/strict");
const test = require("node:test");
const { describeOutcome } = require("../services/paymentOutcomeCatalog");

test("outcome catalog covers every sandbox simulator scenario", () => {
  const cases = [
    ["success", "payment_completed", "Payment completed"],
    ["declined", "card_declined", "Card declined"],
    ["insufficient_funds", "insufficient_funds", "Insufficient funds"],
    ["pending", "payment_processing", "Payment processing"],
    ["failed", "payment_failed", "Payment failed"],
  ];
  for (const [sandboxScenario, code, title] of cases) {
    assert.equal(describeOutcome({ sandboxScenario, status: sandboxScenario === "pending" ? "pending" : "failed", rawProviderResponse: { code } }).title, title);
  }
});

test("unknown outcomes degrade without exposing raw provider errors", () => {
  const result = describeOutcome({ status: "failed", rawProviderResponse: { code: "unexpected_private_code" }, errorMessage: "secret stack" });
  assert.equal(result.title, "Payment failed");
  assert.match(result.explanation, /sandbox payment failure/i);
  assert.doesNotMatch(JSON.stringify(result), /unexpected_private_code|secret stack/i);
});
