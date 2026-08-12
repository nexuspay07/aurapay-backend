const crypto = require("crypto");

const CheckoutSession = require("../models/CheckoutSession");
const Event = require("../models/Event");
const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const eventService = require("./eventService");

const SCENARIOS = {
  success: {
    status: "completed",
    success: true,
    code: "payment_completed",
    message: "Sandbox payment completed.",
  },
  declined: {
    status: "failed",
    success: false,
    code: "card_declined",
    message: "Sandbox payment declined.",
  },
  insufficient_funds: {
    status: "failed",
    success: false,
    code: "insufficient_funds",
    message: "Sandbox payment failed due to insufficient funds.",
  },
  pending: {
    status: "pending",
    success: false,
    code: "payment_processing",
    message: "Sandbox payment is processing.",
  },
  failed: {
    status: "failed",
    success: false,
    code: "payment_failed",
    message: "Sandbox payment failed.",
  },
};

const ALIASES = {
  successful: "success",
  succeed: "success",
  approved: "success",
  decline: "declined",
  card_declined: "declined",
  insufficient: "insufficient_funds",
  processing: "pending",
  generic_failed: "failed",
  generic_failure: "failed",
};

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function normalizeScenario(value) {
  const key = String(value || "success").trim().toLowerCase();
  return SCENARIOS[key] ? key : ALIASES[key] || "success";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function calculateFees(amount) {
  const rate = Number(process.env.SANDBOX_FEE_RATE || 0.029);
  const fixed = Number(process.env.SANDBOX_FEE_FIXED || 0.3);
  const grossAmount = roundMoney(amount);
  const aurapayFee = roundMoney(grossAmount * rate + fixed);
  const netAmount = roundMoney(Math.max(0, grossAmount - aurapayFee));

  return {
    grossAmount,
    aurapayFee,
    netAmount,
    policy: {
      rate,
      fixed,
      environment: "sandbox",
    },
  };
}

async function publish(eventType, resourceType, resourceId, merchant, payload) {
  return eventService.publish({
    eventType,
    resourceType,
    resourceId,
    merchant,
    payload: {
      ...payload,
      environment: "sandbox",
      livemode: false,
    },
  });
}

class SandboxPaymentSimulationService {
  getScenarios() {
    return Object.keys(SCENARIOS);
  }

  calculateFees(amount) {
    return calculateFees(amount);
  }

  async createCheckout(merchant, data) {
    const session = await CheckoutSession.create({
      merchant,
      sessionId: id("chk_test"),
      amount: Number(data.amount),
      currency: String(data.currency || "USD").toUpperCase(),
      customerEmail: data.customerEmail || "",
      description: data.description || "",
      status: "created",
      provider: "AuraPay Sandbox",
      environment: "sandbox",
      livemode: false,
    });

    await publish("checkout.created", "checkout", session._id, merchant, {
      checkoutId: session.sessionId,
      amount: session.amount,
      currency: session.currency,
      status: session.status,
    });

    return session;
  }

  async simulatePayment({
    merchant,
    checkoutSession = null,
    amount,
    currency,
    customerEmail = "",
    description = "",
    scenario = "success",
    idempotencyKey = "",
  }) {
    const normalizedScenario = normalizeScenario(scenario);
    const outcome = SCENARIOS[normalizedScenario];
    const paymentId = id("pay_test");
    const transactionId = id("txn_test");
    const fees = outcome.success
      ? calculateFees(amount)
      : {
          grossAmount: roundMoney(amount),
          aurapayFee: 0,
          netAmount: 0,
          policy: {
            rate: Number(process.env.SANDBOX_FEE_RATE || 0.029),
            fixed: Number(process.env.SANDBOX_FEE_FIXED || 0.3),
            environment: "sandbox",
          },
        };

    const transaction = await Transaction.create({
      merchant,
      checkoutSession: checkoutSession?._id || checkoutSession || null,
      amount: fees.grossAmount,
      currency: String(currency || "USD").toLowerCase(),
      customerEmail,
      provider: "Test",
      paymentType: "test",
      transactionId,
      providerPaymentId: paymentId,
      status: outcome.status,
      success: outcome.success,
      errorMessage: outcome.success ? null : outcome.message,
      rawProviderResponse: {
        provider: "AuraPay Sandbox Simulator",
        scenario: normalizedScenario,
        code: outcome.code,
        livemode: false,
      },
      merchantFee: fees.aurapayFee,
      platformFee: fees.aurapayFee,
      merchantNet: fees.netAmount,
      estimatedFee: fees.aurapayFee,
      estimatedNet: fees.netAmount,
      estimatedProfit: fees.aurapayFee,
      environment: "sandbox",
      livemode: false,
      sandboxScenario: normalizedScenario,
      idempotencyKey,
      confirmedAt: outcome.success ? new Date() : null,
      failedAt: outcome.status === "failed" ? new Date() : null,
    });

    await publish("payment.created", "transaction", transaction._id, merchant, {
      paymentId,
      transactionId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      scenario: normalizedScenario,
    });

    let settlement = null;
    if (outcome.success) {
      settlement = await Settlement.create({
        merchant,
        transaction: transaction._id,
        amount: fees.grossAmount,
        netAmount: fees.netAmount,
        currency: transaction.currency,
        transactionCount: 1,
        refundAmount: 0,
        refundCount: 0,
        outstandingAmount: fees.netAmount,
        status: "pending",
        environment: "sandbox",
        livemode: false,
      });

      transaction.settlement = settlement._id;
      transaction.settled = false;
      await transaction.save();

      await publish("payment.completed", "transaction", transaction._id, merchant, {
        paymentId,
        transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        fees: fees.aurapayFee,
        netAmount: fees.netAmount,
      });

      await publish("settlement.created", "settlement", settlement._id, merchant, {
        settlementId: settlement._id,
        transactionId: transaction._id,
        grossAmount: settlement.amount,
        netAmount: settlement.netAmount,
        currency: settlement.currency,
        status: settlement.status,
      });
    } else if (outcome.status === "failed") {
      await publish("payment.failed", "transaction", transaction._id, merchant, {
        paymentId,
        transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        failureCode: outcome.code,
        failureMessage: outcome.message,
      });
    }

    if (checkoutSession) {
      const nextStatus = outcome.success
        ? "paid"
        : outcome.status === "pending"
        ? "pending"
        : "failed";

      checkoutSession.status = nextStatus;
      checkoutSession.paidAt = outcome.success ? new Date() : null;
      checkoutSession.stripePaymentIntentId = paymentId;
      checkoutSession.environment = "sandbox";
      checkoutSession.provider = "AuraPay Sandbox";
      await checkoutSession.save();

      if (outcome.success) {
        await publish("checkout.paid", "checkout", checkoutSession._id, merchant, {
          checkoutId: checkoutSession.sessionId,
          paymentId,
          transactionId: transaction._id,
          amount: checkoutSession.amount,
          currency: checkoutSession.currency,
        });
      }
    }

    return {
      transaction,
      settlement,
      scenario: normalizedScenario,
      outcome,
    };
  }

  async simulateCheckoutPayment(sessionId, scenario) {
    const checkoutSession = await CheckoutSession.findOne({ sessionId });

    if (!checkoutSession) {
      const err = new Error("Checkout session not found.");
      err.statusCode = 404;
      throw err;
    }

    if (checkoutSession.status === "paid") {
      const existing = await Transaction.findOne({
        checkoutSession: checkoutSession._id,
        status: "completed",
      });

      return {
        transaction: existing,
        settlement: existing?.settlement || null,
        scenario: "success",
        outcome: SCENARIOS.success,
        checkoutSession,
        replay: true,
      };
    }

    const result = await this.simulatePayment({
      merchant: checkoutSession.merchant,
      checkoutSession,
      amount: checkoutSession.amount,
      currency: checkoutSession.currency,
      customerEmail: checkoutSession.customerEmail,
      scenario,
    });

    return {
      ...result,
      checkoutSession,
      replay: false,
    };
  }

  async refund({ merchant, transactionId, amount, reason = "requested_by_customer" }) {
    const transaction = await Transaction.findOne({
      _id: transactionId,
      merchant,
      environment: "sandbox",
    });

    if (!transaction) {
      const err = new Error("Transaction not found.");
      err.statusCode = 404;
      throw err;
    }

    if (transaction.status !== "completed" && transaction.status !== "refunded") {
      const err = new Error("Only completed sandbox payments can be refunded.");
      err.statusCode = 400;
      throw err;
    }

    const alreadyRefunded = Number(transaction.refund?.refundAmount || 0);
    const refundable = roundMoney(Number(transaction.amount || 0) - alreadyRefunded);
    const refundAmount = roundMoney(amount || refundable);

    if (refundAmount <= 0 || refundAmount > refundable) {
      const err = new Error("Refund amount cannot exceed the remaining refundable amount.");
      err.statusCode = 400;
      throw err;
    }

    const totalRefunded = roundMoney(alreadyRefunded + refundAmount);
    const fullyRefunded = totalRefunded >= Number(transaction.amount || 0);

    transaction.status = fullyRefunded ? "refunded" : "completed";
    transaction.success = !fullyRefunded;
    transaction.refundedAt = new Date();
    transaction.refund = {
      providerRefundId: id("ref_test"),
      providerRefundStatus: "succeeded",
      refundAmount: totalRefunded,
      refundCurrency: transaction.currency,
      refundReason: reason,
      refundRequestedAt: new Date(),
      refundCompletedAt: new Date(),
    };

    await transaction.save();

    const settlement = await Settlement.findOne({
      transaction: transaction._id,
      merchant,
    });

    if (settlement) {
      const refundShare = Number(transaction.amount || 0) > 0
        ? refundAmount / Number(transaction.amount)
        : 0;
      const netReduction = roundMoney(Number(settlement.netAmount || 0) * refundShare);
      settlement.refundAmount = roundMoney(Number(settlement.refundAmount || 0) + netReduction);
      settlement.refundCount = Number(settlement.refundCount || 0) + 1;
      settlement.outstandingAmount = roundMoney(
        Math.max(0, Number(settlement.netAmount || 0) - Number(settlement.refundAmount || 0))
      );
      if (settlement.outstandingAmount === 0) {
        settlement.status = "refunded";
      }
      settlement.environment = "sandbox";
      settlement.livemode = false;
      await settlement.save();
    }

    await publish("payment.refunded", "transaction", transaction._id, merchant, {
      paymentId: transaction.providerPaymentId,
      refundId: transaction.refund.providerRefundId,
      amount: refundAmount,
      totalRefunded,
      remainingRefundable: roundMoney(Number(transaction.amount || 0) - totalRefunded),
      currency: transaction.currency,
      reason,
    });

    return {
      transaction,
      settlement,
      refundAmount,
      totalRefunded,
    };
  }
}

module.exports = new SandboxPaymentSimulationService();
