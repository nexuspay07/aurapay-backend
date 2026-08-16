const crypto =
  require("crypto");

const merchantWebhookRepository =
  require("../repositories/merchantWebhookRepository");
const WebhookDelivery =
  require("../models/WebhookDelivery");
const safeWebhookHttpClient =
  require("./safeWebhookHttpClient");

function createSignature(secret, payload) {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

function safeFailure(error) {
  if (error?.code === "destination_blocked" ||
      error?.code === "destination_unresolvable" ||
      error?.code === "invalid_webhook_url") {
    return {
      errorCode: "destination_blocked",
      errorMessage: "Webhook destination is not allowed.",
    };
  }

  const safeCodes = new Set([
    "delivery_failed",
    "delivery_timeout",
    "response_too_large",
  ]);

  return {
    errorCode: safeCodes.has(error?.code) ? error.code : "delivery_failed",
    errorMessage:
      error?.code === "delivery_timeout"
        ? "Webhook endpoint timed out."
        : error?.code === "response_too_large"
        ? "Webhook endpoint returned an oversized response."
        : "Webhook endpoint could not be reached.",
  };
}

class MerchantWebhookService {

  async validateDestination(url) {
    return safeWebhookHttpClient.validate(url);
  }

  async attemptDelivery(webhook, payload, eventType) {
    const startedAt = Date.now();

    try {
      const response = await safeWebhookHttpClient.postJson(
        webhook.url,
        payload,
        {
          "X-AuraPay-Signature": createSignature(webhook.secret, payload),
          "X-AuraPay-Event": eventType,
        }
      );

      return {
        status: response.delivered ? "delivered" : "failed",
        statusCode: response.statusCode,
        latencyMs: Date.now() - startedAt,
        errorCode: response.delivered ? "" : "remote_non_success",
        errorMessage: response.delivered
          ? ""
          : "Webhook endpoint returned a non-2xx response.",
        deliveredAt: response.delivered ? new Date() : null,
      };
    } catch (error) {
      return {
        status: "failed",
        statusCode: null,
        latencyMs: Date.now() - startedAt,
        deliveredAt: null,
        ...safeFailure(error),
      };
    }
  }

  // ======================================
  // REGISTER WEBHOOK
  // ======================================

  async registerWebhook({

    merchant,

    url,

    secret,

    eventTypes,

  }) {

    await this.validateDestination(url);

    return await merchantWebhookRepository.create({

      merchant,

      url,

      secret,

      eventTypes,

    });

  }

  // ======================================
  // UPDATE WEBHOOK
  // ======================================

  async updateWebhook(

    webhookId,

    updates

  ) {

    if (Object.prototype.hasOwnProperty.call(updates, "url")) {
      await this.validateDestination(updates.url);
    }

    return await merchantWebhookRepository.update(

      webhookId,

      updates

    );

  }

  // ======================================
  // DELETE WEBHOOK
  // ======================================

  async deleteWebhook(

    webhookId

  ) {

    return await merchantWebhookRepository.delete(

      webhookId

    );

  }

  // ======================================
  // GET WEBHOOKS
  // ======================================

  async getMerchantWebhooks(

    merchantId

  ) {

    return await merchantWebhookRepository.findByMerchant(

      merchantId

    );

  }

  // ======================================
  // DELIVER EVENT
  // ======================================

  async deliverEvent(

    merchantId,

    event

  ) {

    const webhooks =

      await merchantWebhookRepository.findActive(

        merchantId

      );

    for (const webhook of webhooks) {

      if (

        webhook.eventTypes.length &&

        !webhook.eventTypes.includes(

          event.eventType

        )

      ) {

        continue;

      }

      const result = await this.attemptDelivery(
        webhook,
        event,
        event.eventType
      );

      const delivery =
        await WebhookDelivery.create({
          merchant: merchantId,
          webhook: webhook._id,
          eventType: event.eventType,
          status: result.status,
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          attempts: 1,
          deliveredAt: result.deliveredAt,
          payloadPreview: {
            id: event._id,
            type: event.eventType,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            environment:
              event.environment ||
              event.payload?.environment ||
              "sandbox",
            livemode: false,
          },
          environment:
            event.environment ||
            event.payload?.environment ||
            "sandbox",
        });

      webhook.lastDeliveryAt = new Date();
      webhook.lastDeliveryStatus = delivery.status;
      await webhook.save();

    }

  }

}

module.exports =
  new MerchantWebhookService();

module.exports.createSignature = createSignature;
module.exports.safeFailure = safeFailure;
