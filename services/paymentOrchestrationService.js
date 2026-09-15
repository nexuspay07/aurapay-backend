const crypto = require("node:crypto");

const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const eventService = require("./eventService");
const { normalizeProviderResult } = require("./providers/providerContract");
const { SANDBOX_PROVIDER_ID, providerRegistry } = require("./providers/providerRegistry");

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function calculateFees(amount) {
  const rate = Number(process.env.SANDBOX_FEE_RATE || 0.029);
  const fixed = Number(process.env.SANDBOX_FEE_FIXED || 0.3);
  const grossAmount = roundMoney(amount);
  const aurapayFee = roundMoney(grossAmount * rate + fixed);
  return { grossAmount, aurapayFee, netAmount: roundMoney(Math.max(0, grossAmount - aurapayFee)), policy: { rate, fixed, environment: "sandbox" } };
}

async function publish(eventType, resourceType, resourceId, merchant, payload) {
  return eventService.publish({ eventType, resourceType, resourceId, merchant, payload: { ...payload, environment: "sandbox", livemode: false } });
}

class PaymentOrchestrationService {
  constructor(registry = providerRegistry) {
    this.registry = registry;
  }

  calculateFees(amount) {
    return calculateFees(amount);
  }

  async createPayment({ providerId = SANDBOX_PROVIDER_ID, merchant, checkoutSession = null, amount, currency, customerEmail = "", scenario = "success", idempotencyKey = "", requestId = "" }) {
    const adapter = this.registry.resolve(providerId);
    const providerResult = normalizeProviderResult(await adapter.executePayment({ amount, currency, scenario }));
    if (providerResult.provider !== adapter.id) {
      throw new Error(`Provider result identity mismatch for ${adapter.id}.`);
    }
    const transactionId = id("txn_test");
    const successFees = calculateFees(providerResult.amount);
    const fees = providerResult.success ? successFees : { ...successFees, aurapayFee: 0, netAmount: 0 };
    const sandboxScenario = providerResult.metadata.scenario;

    const transaction = await Transaction.create({
      merchant,
      checkoutSession: checkoutSession?._id || checkoutSession || null,
      amount: providerResult.amount,
      currency: providerResult.currency.toLowerCase(),
      customerEmail,
      provider: "Test",
      paymentType: "test",
      transactionId,
      providerPaymentId: providerResult.providerPaymentId,
      status: providerResult.status,
      success: providerResult.success,
      errorMessage: providerResult.success ? null : providerResult.outcome.message,
      rawProviderResponse: {
        provider: providerResult.provider,
        scenario: sandboxScenario,
        code: providerResult.outcome.code,
        livemode: providerResult.livemode,
      },
      merchantFee: fees.aurapayFee,
      platformFee: fees.aurapayFee,
      merchantNet: fees.netAmount,
      estimatedFee: fees.aurapayFee,
      estimatedNet: fees.netAmount,
      estimatedProfit: fees.aurapayFee,
      environment: providerResult.environment,
      livemode: providerResult.livemode,
      sandboxScenario,
      idempotencyKey,
      apiRequestId: requestId,
      confirmedAt: providerResult.success ? new Date() : null,
      failedAt: providerResult.status === "failed" ? new Date() : null,
    });

    await publish("payment.created", "transaction", transaction._id, merchant, {
      paymentId: providerResult.providerPaymentId, transactionId, amount: transaction.amount,
      currency: transaction.currency, status: transaction.status, scenario: sandboxScenario,
    });

    let settlement = null;
    if (providerResult.success) {
      settlement = await Settlement.create({
        merchant, transaction: transaction._id, amount: fees.grossAmount, netAmount: fees.netAmount,
        currency: transaction.currency, transactionCount: 1, refundAmount: 0, refundCount: 0,
        outstandingAmount: fees.netAmount, status: "pending", environment: "sandbox", livemode: false,
      });
      transaction.settlement = settlement._id;
      transaction.settled = false;
      await transaction.save();
      await publish("payment.completed", "transaction", transaction._id, merchant, {
        paymentId: providerResult.providerPaymentId, transactionId, amount: transaction.amount,
        currency: transaction.currency, fees: fees.aurapayFee, netAmount: fees.netAmount,
      });
      await publish("settlement.created", "settlement", settlement._id, merchant, {
        settlementId: settlement._id, transactionId: transaction._id, grossAmount: settlement.amount,
        netAmount: settlement.netAmount, currency: settlement.currency, status: settlement.status,
      });
    } else if (providerResult.status === "failed") {
      await publish("payment.failed", "transaction", transaction._id, merchant, {
        paymentId: providerResult.providerPaymentId, transactionId, amount: transaction.amount,
        currency: transaction.currency, failureCode: providerResult.outcome.code,
        failureMessage: providerResult.outcome.message,
      });
    }

    if (checkoutSession) {
      checkoutSession.status = providerResult.success ? "paid" : providerResult.status === "pending" ? "pending" : "failed";
      checkoutSession.paidAt = providerResult.success ? new Date() : null;
      // Preserve the Phase 1-6 checkout schema field until its eventual migration.
      checkoutSession.stripePaymentIntentId = providerResult.providerPaymentId;
      checkoutSession.environment = "sandbox";
      checkoutSession.provider = "AuraPay Sandbox";
      await checkoutSession.save();
      if (providerResult.success) {
        await publish("checkout.paid", "checkout", checkoutSession._id, merchant, {
          checkoutId: checkoutSession.sessionId, paymentId: providerResult.providerPaymentId,
          transactionId: transaction._id, amount: checkoutSession.amount, currency: checkoutSession.currency,
        });
      }
    }

    return {
      transaction,
      settlement,
      scenario: sandboxScenario,
      outcome: { status: providerResult.status, success: providerResult.success, ...providerResult.outcome },
      providerResult,
    };
  }
}

module.exports = new PaymentOrchestrationService();
module.exports.PaymentOrchestrationService = PaymentOrchestrationService;
module.exports.calculateFees = calculateFees;
