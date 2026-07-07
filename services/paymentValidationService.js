const MAX_PAYMENT_LIMIT = 10000;

function validatePayment(user, body) {
  const amount = Number(body.amount);
  const currency = String(body.currency || "").toLowerCase();

  if (!amount || Number.isNaN(amount)) {
    throw new Error("Invalid payment amount.");
  }

  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (!["usd", "eur"].includes(currency)) {
    throw new Error("Unsupported currency.");
  }

  if (amount > MAX_PAYMENT_LIMIT) {
    throw new Error(
      `Maximum payment limit is ${MAX_PAYMENT_LIMIT}.`
    );
  }

  if (!user.balance || typeof user.balance !== "object") {
    throw new Error(
      "Wallet configuration is invalid."
    );
  }

  return {
    amount,
    currency,
  };
}

module.exports = {
  validatePayment,
};