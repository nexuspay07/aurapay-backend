const axios =
  require("axios");

const crypto =
  require("crypto");

const merchantWebhookRepository =
  require("../repositories/merchantWebhookRepository");
const WebhookDelivery =
  require("../models/WebhookDelivery");

class MerchantWebhookService {

  // ======================================
  // REGISTER WEBHOOK
  // ======================================

  async registerWebhook({

    merchant,

    url,

    secret,

    eventTypes,

  }) {

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

      const payload =
        JSON.stringify(event);

      const signature =

        crypto

          .createHmac(

            "sha256",

            webhook.secret

          )

          .update(payload)

          .digest("hex");

      const startedAt = Date.now();
      let status = "delivered";
      let statusCode = 200;
      let errorMessage = "";

      try {

        const response =
          await axios.post(

          webhook.url,

          event,

          {

            headers: {

              "Content-Type":

                "application/json",

              "X-AuraPay-Signature":

                signature,

              "X-AuraPay-Event":

                event.eventType,

            },

            timeout: 10000,
            validateStatus: () => true,

          }

        );

        statusCode = response.status;
        status =
          response.status >= 200 && response.status < 300
            ? "delivered"
            : "failed";
        errorMessage =
          status === "failed"
            ? "Webhook endpoint returned a non-2xx response."
            : "";

      } catch (error) {

        status = "failed";
        statusCode = null;
        errorMessage = "Webhook endpoint could not be reached.";

      }

      const delivery =
        await WebhookDelivery.create({
          merchant: merchantId,
          webhook: webhook._id,
          eventType: event.eventType,
          status,
          statusCode,
          latencyMs: Date.now() - startedAt,
          errorMessage,
          attempts: 1,
          deliveredAt:
            status === "delivered"
              ? new Date()
              : null,
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
