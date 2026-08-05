const eventRepository =
  require("../repositories/eventRepository");

  const merchantWebhookService =
  require("./merchantWebhookService");

class EventService {

 // ======================================
// PUBLISH EVENT
// ======================================

async publish({

  eventType,

  resourceType,

  resourceId,

  merchant,

  payload,

}) {

  // Create the event
  const event =

    await eventRepository.create({

      eventType,

      resourceType,

      resourceId,

      merchant,

      payload,

    });

  // Deliver to merchant webhooks
  await merchantWebhookService.deliverEvent(

    merchant,

    event

  );

  // Return the created event
  return event;

}

  // ======================================
  // GET PENDING EVENTS
  // ======================================

  async getPendingEvents() {

    return await eventRepository.findPending();

  }

  // ======================================
  // MARK DELIVERED
  // ======================================

  async markDelivered(

    eventId

  ) {

    return await eventRepository.markDelivered(

      eventId

    );

  }

  // ======================================
  // GET MERCHANT EVENTS
  // ======================================

  async getMerchantEvents(

    merchantId

  ) {

    return await eventRepository.findByMerchant(

      merchantId

    );

  }

}

module.exports =
  new EventService();