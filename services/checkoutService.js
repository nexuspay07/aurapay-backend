const crypto = require("crypto");

const checkoutRepository =
  require("../repositories/checkoutRepository");

const stripeService =
  require("./stripeService");
const sandboxPaymentSimulationService =
  require("./sandboxPaymentSimulationService");

class CheckoutService {

  // ======================================
  // CREATE CHECKOUT SESSION
  // ======================================

  async createSession(
    merchantId,
    data
  ) {

    return await sandboxPaymentSimulationService.createCheckout(
      merchantId,
      data
    );

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

    const paymentIntentId =
      `pay_test_pending_${crypto.randomBytes(8).toString("hex")}`;

    await checkoutRepository.updatePaymentIntent(
      id,
      paymentIntentId
    );

    return {
      clientSecret: "",
      paymentIntentId,
      provider: "AuraPay Sandbox",
      environment: "sandbox",
      livemode: false,
      scenarios: sandboxPaymentSimulationService.getScenarios(),
      message: "Sandbox checkout initialized. No real funds will be charged.",
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
