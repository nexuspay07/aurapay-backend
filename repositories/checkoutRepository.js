const CheckoutSession =
  require("../models/CheckoutSession");

class CheckoutRepository {

  // ======================================
  // CREATE SESSION
  // ======================================

  async create(data) {

    return await CheckoutSession.create(
      data
    );

  }

  // ======================================
  // GET SESSION BY ID
  // ======================================

  async findById(id) {

    return await CheckoutSession.findById(
      id
    );

  }

  // ======================================
  // GET SESSION BY SESSION ID
  // ======================================

  async findBySessionId(
    sessionId
  ) {

    return await CheckoutSession.findOne({
      sessionId,
    }).populate("merchant", "businessName legalName");

  }

  // ======================================
  // GET ALL MERCHANT SESSIONS
  // ======================================

  async findByMerchant(
    merchantId
  ) {

    return await CheckoutSession.find({

      merchant: merchantId,

    }).sort({

      createdAt: -1,

    });

  }

  // ======================================
  // SAVE STRIPE PAYMENT INTENT
  // ======================================

  async updatePaymentIntent(

    id,

    paymentIntentId

  ) {

    return await CheckoutSession.findByIdAndUpdate(

      id,

      {

        stripePaymentIntentId:
          paymentIntentId,

      },

      {

        returnDocument: "after",

      }

    );

  }

  // ======================================
  // UPDATE STATUS
  // ======================================

  async updateStatus(

    id,

    status

  ) {

    return await CheckoutSession.findByIdAndUpdate(

      id,

      {

        status,

      },

      {

        returnDocument: "after",

      }

    );

  }

}

module.exports =
  new CheckoutRepository();
