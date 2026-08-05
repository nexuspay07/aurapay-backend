const axios =
  require("axios");

const crypto =
  require("crypto");

const merchantWebhookRepository =
  require("../repositories/merchantWebhookRepository");

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

      try {

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

          }

        );

      } catch (error) {

        console.error(

          `Webhook failed (${webhook.url}):`,

          error.message

        );

      }

    }

  }

}

module.exports =
  new MerchantWebhookService();