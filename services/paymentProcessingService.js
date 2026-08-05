const transactionRepository =
  require("../repositories/transactionRepository");

  const eventService =
  require("./eventService");

class PaymentProcessingService {

  // ======================================
  // PROCESS SUCCESSFUL PAYMENT
  // ======================================

  async processSuccessfulPayment({

  merchant,

  checkoutSession,

  paymentIntentId,

  amount,

  currency,

  customerEmail,

  provider = "Stripe",

}) {

  // ======================================
  // CHECK FOR EXISTING TRANSACTION
  // ======================================

  const existingTransaction =
    await transactionRepository.findByPaymentIntent(

      paymentIntentId

    );

  if (existingTransaction) {

    return existingTransaction;

  }

  // ======================================
  // PLATFORM FEES
  // ======================================

  const merchantFee =
    Number(amount) * 0.029;

  const platformFee =
    0.30;

  const merchantNet =
    Number(amount) -
    merchantFee -
    platformFee;

  // ======================================
  // CREATE TRANSACTION
  // ======================================

  const transaction =
  await transactionRepository.create({

    merchant,

    checkoutSession,

    amount,

    currency,

    customerEmail,

    provider,

    providerPaymentId:
      paymentIntentId,

    paymentType:
      provider.toLowerCase(),

    merchantFee,

    platformFee,

    merchantNet,

    estimatedProfit:
      platformFee,

    status:
      "completed",

    success: true,

    completedAt:
      new Date(),

  });

await eventService.publish({

  eventType:
    "payment.completed",

  resourceType:
    "transaction",

  resourceId:
    transaction._id,

  merchant,

  payload:
    transaction,

});

return transaction;
}
}

module.exports =
  new PaymentProcessingService();