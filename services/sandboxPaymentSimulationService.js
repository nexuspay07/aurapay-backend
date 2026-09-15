const crypto = require("crypto");

const CheckoutSession = require("../models/CheckoutSession");
const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const eventService = require("./eventService");
const paymentOrchestrationService = require("./paymentOrchestrationService");
const { SCENARIOS } = require("./providers/sandboxPaymentProvider");

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
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
    return paymentOrchestrationService.calculateFees(amount);
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
    requestId = "",
  }) {
    return paymentOrchestrationService.createPayment({
      merchant, checkoutSession, amount, currency, customerEmail, description,
      scenario, idempotencyKey, requestId,
    });
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
