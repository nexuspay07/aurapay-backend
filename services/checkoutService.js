const crypto = require("crypto");

const checkoutRepository =
  require("../repositories/checkoutRepository");

const stripeService =
  require("./stripeService");

class CheckoutService {

  // ======================================
  // CREATE CHECKOUT SESSION
  // ======================================

  async createSession(
    merchantId,
    data
  ) {

    const sessionId =
      "CHK_" +
      crypto
        .randomBytes(8)
        .toString("hex")
        .toUpperCase();

    return await checkoutRepository.create({

      merchant: merchantId,

      sessionId,

      amount: data.amount,

      currency:
        data.currency || "USD",

      customerEmail:
        data.customerEmail,

      status: "created",

      provider: "AuraPay",

    });

  }

  // ======================================
  // GET SESSION
  // ======================================

  async getSession(
    sessionId
  ) {

    return await checkoutRepository.findBySessionId(
      sessionId
    );

  }

  // ======================================
  // GET MERCHANT SESSIONS
  // ======================================

  async getMerchantSessions(
    merchantId
  ) {

    return await checkoutRepository.findByMerchant(
      merchantId
    );

  }

  // ======================================
  // CREATE STRIPE PAYMENT INTENT
  // ======================================

  async createPaymentIntent(id) {

    const session =
      await checkoutRepository.findById(
        id
      );

    if (!session) {

      throw new Error(
        "Checkout session not found."
      );

    }

    const paymentIntent =
      await stripeService.createPaymentIntent(

        session.amount,

        session.currency

      );

    await checkoutRepository.updatePaymentIntent(

      id,

      paymentIntent.id

    );

    return {

      clientSecret:
        paymentIntent.client_secret,

      paymentIntentId:
        paymentIntent.id,

    };

  }

  // ======================================
  // MARK SESSION PAID
  // ======================================

  async markPaid(id) {

    return await checkoutRepository.updateStatus(

      id,

      "paid"

    );

  }

}

module.exports =
  new CheckoutService();