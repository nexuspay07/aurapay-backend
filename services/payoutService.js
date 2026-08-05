const payoutRepository =
  require("../repositories/payoutRepository");

const settlementService =
  require("./settlementService");

class PayoutService {

  // ======================================
  // CREATE PAYOUT
  // ======================================

  async createPayout({

    merchant,

    settlements,

    grossAmount,

    netAmount,

    currency,

  }) {

    return await payoutRepository.create({

      merchant,

      settlements,

      grossAmount,

      netAmount,

      currency,

      status: "pending",

    });

  }

  // ======================================
  // GENERATE PAYOUT
  // ======================================

  async generatePayout(
    merchantId
  ) {

    const settlements =
      await settlementService.getEligibleSettlements(
        merchantId
      );

    if (!settlements.length) {

      throw new Error(
        "No eligible settlements"
      );

    }

    const grossAmount =
      settlements.reduce(

        (sum, settlement) =>

          sum +
          Number(settlement.amount),

        0

      );

    const netAmount =
      settlements.reduce(

        (sum, settlement) =>

          sum +
          Number(settlement.outstandingAmount),

        0

      );

    const payout =
      await payoutRepository.create({

        merchant: merchantId,

        settlements:
          settlements.map(

            settlement =>
              settlement._id

          ),

        grossAmount,

        netAmount,

        currency:
          settlements[0].currency,

        status: "pending",

      });

    await settlementService.attachToPayout(

      settlements.map(

        settlement =>
          settlement._id

      ),

      payout._id

    );

    return payout;

  }

  // ======================================
  // GET MERCHANT PAYOUTS
  // ======================================

  async getMerchantPayouts(
    merchantId
  ) {

    return await payoutRepository.findByMerchant(

      merchantId

    );

  }

    // ======================================
  // COMPLETE PAYOUT
  // ======================================

  async completePayout(
    payoutId
  ) {

    const payout =
      await payoutRepository.findById(
        payoutId
      );

    if (!payout) {

      throw new Error(
        "Payout not found"
      );

    }

    await settlementService.markPaid(
      payoutId
    );

    return await payoutRepository.updateStatus(

      payoutId,

      "completed"

    );

  }

    // ======================================
  // PROCESS PAYOUT
  // ======================================

  async processPayout(

    payoutId

  ) {

    const payout =
      await payoutRepository.findById(
        payoutId
      );

    if (!payout) {

      throw new Error(
        "Payout not found"
      );

    }

    if (payout.status !== "pending") {

      throw new Error(
        "Payout cannot be processed"
      );

    }

    const payoutReference =
      `PAYOUT-${Date.now()}`;

    return await payoutRepository.processPayout(

      payoutId,

      payoutReference

    );

  }

}

module.exports =
  new PayoutService();