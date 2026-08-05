const Event =
  require("../models/Event");

class EventRepository {

  // ======================================
  // CREATE EVENT
  // ======================================

  async create(data) {

    return await Event.create(data);

  }

  // ======================================
  // FIND BY ID
  // ======================================

  async findById(eventId) {

    return await Event.findById(eventId);

  }

  // ======================================
  // FIND PENDING EVENTS
  // ======================================

  async findPending(limit = 100) {

    return await Event.find({

      delivered: false,

    })
      .sort({

        createdAt: 1,

      })
      .limit(limit);

  }

  // ======================================
  // MARK DELIVERED
  // ======================================

  async markDelivered(eventId) {

    return await Event.findByIdAndUpdate(

      eventId,

      {

        delivered: true,

        deliveredAt: new Date(),

      },

      {

        new: true,

        returnDocument: "after",

      }

    );

  }

  // ======================================
  // FIND MERCHANT EVENTS
  // ======================================

  async findByMerchant(

    merchantId

  ) {

    return await Event.find({

      merchant: merchantId,

    }).sort({

      createdAt: -1,

    });

  }

  // ======================================
// RECORD DELIVERY ATTEMPT
// ======================================

async recordAttempt(

  eventId,

  error = null

) {

  return await Event.findByIdAndUpdate(

    eventId,

    {

      $inc: {

        deliveryAttempts: 1,

      },

      lastDeliveryAttempt: new Date(),

      lastError: error,

    },

    {

      new: true,

      returnDocument: "after",

    }

  );

}

}


module.exports =
  new EventRepository();