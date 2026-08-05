const settlementRepository =
  require("../repositories/settlementRepository");

class SettlementService {

  // ======================================
  // CREATE SETTLEMENT
  // ======================================

  async createSettlement({

    merchant,

    transaction,

    amount,

    currency,

    merchantNet,

  }) {

    return await settlementRepository.create({

      merchant,

      transaction,

      amount,

      currency,

      netAmount:
        merchantNet,

       refundAmount: 0,

    refundCount: 0,

    outstandingAmount: merchantNet,  

      status:
        "pending",

      settlementDate:
        null,

    });

  }

  // ======================================
  // GET MERCHANT SETTLEMENTS
  // ======================================

  async getMerchantSettlements(
    merchantId
  ) {

    return await settlementRepository.findByMerchant(
      merchantId
    );

  }

  // ======================================
  // COMPLETE SETTLEMENT
  // ======================================

  async completeSettlement(
    settlementId
  ) {

    return await settlementRepository.updateStatus(

      settlementId,

      "completed"

    );

  }

    // ======================================
  // APPLY REFUND
  // ======================================

  async applyRefund(

    transactionId,

    refundAmount

  ) {

    return await settlementRepository.applyRefund(

      transactionId,

      refundAmount

    );

  }

    // ======================================
  // GET ELIGIBLE SETTLEMENTS
  // ======================================

  async getEligibleSettlements(
    merchantId
  ) {

    return await settlementRepository
      .findEligibleForPayout(
        merchantId
      );

  }

 // ======================================
// PROCESS SETTLEMENT
// ======================================

async processSettlement(

  transactionId

) {

  const settlement =
    await settlementRepository.findByTransaction(
      transactionId
    );

  if (!settlement) {

    throw new Error(
      "Settlement not found"
    );

  }

  if (settlement.status !== "pending") {

    throw new Error(
      "Settlement is not pending"
    );

  }

  if (
    settlement.outstandingAmount <= 0
  ) {

    throw new Error(
      "Settlement has no outstanding balance"
    );

  }

  return await settlementRepository.updateStatus(

    settlement._id,

    "processing"

  );

}

async attachToPayout(

  settlementIds,

  payoutId

) {

  return await settlementRepository.attachToPayout(

    settlementIds,

    payoutId

  );

}

async markPaid(

  payoutId

) {

  const settlements =
    await settlementRepository.findByPayout(
      payoutId
    );

  if (!settlements.length) {

    throw new Error(
      "No settlements found for payout"
    );

  }

  const invalidSettlement =
    settlements.find(
      settlement =>
        ![
          "processing",
          "completed",
        ].includes(settlement.status)
    );

  if (invalidSettlement) {

    throw new Error(
      "Settlement cannot be marked paid from current status"
    );

  }

  return await settlementRepository.markPaidByPayout(
    payoutId
  );

}

}



module.exports =
  new SettlementService();
