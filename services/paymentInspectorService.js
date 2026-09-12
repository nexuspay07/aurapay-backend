const crypto = require("crypto");
const mongoose = require("mongoose");
const ApiLog = require("../models/ApiLog");
const Event = require("../models/Event");
const MerchantWebhook = require("../models/MerchantWebhook");
const Settlement = require("../models/Settlement");
const Transaction = require("../models/Transaction");
const WebhookDelivery = require("../models/WebhookDelivery");
const { describeOutcome } = require("./paymentOutcomeCatalog");
const { buildPaymentTimeline } = require("./paymentTimelineBuilder");

function iso(value) { return value ? new Date(value).toISOString() : null; }
function safeId(value) { return value ? String(value) : null; }
function idempotencyReference(value) {
  return value ? `idem_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 12)}` : null;
}

class PaymentInspectorService {
  async inspect(merchantId, paymentId) {
    const identifiers = [{ providerPaymentId: paymentId }, { transactionId: paymentId }];
    if (mongoose.Types.ObjectId.isValid(paymentId)) identifiers.unshift({ _id: paymentId });
    const transaction = await Transaction.findOne({
      merchant: merchantId,
      $or: identifiers,
    }).lean();
    if (!transaction) return null;

    const settlement = await Settlement.findOne({ merchant: merchantId, transaction: transaction._id }).lean();
    const resourceIds = [transaction._id, settlement?._id].filter(Boolean);
    const events = await Event.find({ merchant: merchantId, resourceId: { $in: resourceIds } }).sort({ createdAt: 1 }).lean();
    const eventIds = events.flatMap((event) => [event._id, String(event._id)]);
    const deliveries = eventIds.length ? await WebhookDelivery.find({
      merchant: merchantId,
      "payloadPreview.id": { $in: eventIds },
    }).sort({ createdAt: 1 }).lean() : [];
    const webhookConfigured = Boolean(await MerchantWebhook.exists({ merchant: merchantId, active: true }));
    const apiLog = transaction.apiRequestId ? await ApiLog.findOne({
      merchant: merchantId,
      requestId: transaction.apiRequestId,
    }).lean() : null;
    const outcome = describeOutcome(transaction);
    const fees = Number(transaction.merchantFee || transaction.estimatedFee || 0);
    const completed = transaction.status === "completed" || transaction.status === "refunded";

    return {
      payment: {
        id: safeId(transaction._id), paymentId: transaction.providerPaymentId || null,
        transactionId: transaction.transactionId || safeId(transaction._id), amount: Number(transaction.amount),
        currency: transaction.currency, customerEmail: transaction.customerEmail || "", status: transaction.status,
        provider: transaction.provider, environment: transaction.environment || "sandbox", livemode: transaction.livemode === true,
        sandboxScenario: transaction.sandboxScenario || null, outcome: outcome.code, fees,
        netAmount: Number(transaction.merchantNet || transaction.estimatedNet || 0), createdAt: iso(transaction.createdAt), updatedAt: iso(transaction.updatedAt),
      },
      summary: { title: outcome.title, state: transaction.status, failureStage: transaction.status === "failed" ? outcome.stage : null,
        explanation: outcome.explanation, suggestedAction: outcome.suggestedAction },
      financialImpact: { requestedAmount: Number(transaction.amount), chargedAmount: completed ? Number(transaction.amount) : 0,
        fees: completed ? fees : 0, netAmount: completed ? Number(transaction.merchantNet || transaction.estimatedNet || 0) : 0,
        settlementCreated: Boolean(settlement), settlementState: settlement?.status || (transaction.status === "pending" ? "not_created_yet" : "not_created") },
      timeline: buildPaymentTimeline({ transaction, outcome, settlement, events, webhookConfigured, deliveries, apiLog }),
      settlement: settlement ? { id: safeId(settlement._id), status: settlement.status, amount: Number(settlement.amount),
        netAmount: Number(settlement.netAmount), currency: settlement.currency, environment: settlement.environment || "sandbox", createdAt: iso(settlement.createdAt) } : null,
      events: { count: events.length, items: events.map((event) => ({ id: safeId(event._id), type: event.eventType,
        resourceType: event.resourceType, delivered: event.delivered === true, deliveryAttempts: Number(event.deliveryAttempts || 0), createdAt: iso(event.createdAt) })) },
      webhooks: { configured: webhookConfigured, attemptCount: deliveries.reduce((sum, delivery) => sum + Number(delivery.attempts || 0), 0),
        deliveries: deliveries.map((delivery) => ({ id: safeId(delivery._id), eventType: delivery.eventType, status: delivery.status,
          attempts: Number(delivery.attempts || 0), httpStatus: delivery.statusCode || null, attemptedAt: iso(delivery.createdAt), deliveredAt: iso(delivery.deliveredAt) })) },
      apiRequest: apiLog ? { requestId: apiLog.requestId, endpoint: apiLog.endpoint, method: apiLog.method,
        statusCode: apiLog.status, latencyMs: apiLog.latencyMs, timestamp: iso(apiLog.createdAt) } : null,
      developer: { requestId: transaction.apiRequestId || null, transactionId: transaction.transactionId || safeId(transaction._id),
        paymentId: transaction.providerPaymentId || null, idempotencyReference: idempotencyReference(transaction.idempotencyKey) },
    };
  }
}

module.exports = new PaymentInspectorService();
