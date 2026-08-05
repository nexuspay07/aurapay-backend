const Settlement =
  require("../models/Settlement");

class SettlementRepository {

  // ======================================
  // CREATE SETTLEMENT
  // ======================================

  async create(data) {

    return await Settlement.create(
      data
    );

  }

  // ======================================
  // GET BY TRANSACTION
  // ======================================

  async findByTransaction(
    transactionId
  ) {

    return await Settlement.findOne({

      transaction:
        transactionId,

    });

  }

  // ======================================
  // GET MERCHANT SETTLEMENTS
  // ======================================

  async findByMerchant(
    merchantId
  ) {

    return await Settlement.find({

      merchant:
        merchantId,

    }).sort({

      createdAt: -1,

    });

  }

  // ======================================
  // UPDATE STATUS
  // ======================================

  async updateStatus(

    id,

    status

  ) {

    

    return await Settlement.findByIdAndUpdate(

      id,

      {

       status,

  processedAt:
    status === "processing"
      ? new Date()
      : undefined,

  settlementDate:
    status === "completed"
      ? new Date()
      : undefined,

      },

      {

        returnDocument: "after",

      }

    );

  }

  // ======================================
// ATTACH TO PAYOUT
// ======================================

async attachToPayout(

  settlementIds,

  payoutId

) {

  return await Settlement.updateMany(

    {

      _id: {

        $in: settlementIds,

      },

    },

    {

      payout: payoutId,

      status: "processing",

    }

  );

}

// ======================================
// GET BY PAYOUT
// ======================================

async findByPayout(

  payoutId

) {

  return await Settlement.find({

    payout: payoutId,

  });

}

// ======================================
// MARK PAID BY PAYOUT
// ======================================

async markPaidByPayout(

  payoutId

) {

  return await Settlement.updateMany(

    {

      payout: payoutId,

    },

    {

      status: "completed",

      paidAt: new Date(),

    }

  );

}

    // ======================================
  // GET ELIGIBLE SETTLEMENTS
  // ======================================

  async findEligibleForPayout(
    merchantId
  ) {

    return await Settlement.find({

      merchant: merchantId,

      status: "completed",

      outstandingAmount: {
        $gt: 0,
      },

    }).sort({

      createdAt: 1,

    });

  }

    // ======================================
  // APPLY REFUND
  // ======================================

  async applyRefund(

    transactionId,

    refundAmount

  ) {

    const settlement =
      await Settlement.findOne({

        transaction:
          transactionId,

      });

    if (!settlement) {

      throw new Error(
        "Settlement not found"
      );

    }

    settlement.refundAmount =
      Number(settlement.refundAmount || 0) +
      Number(refundAmount);

    settlement.refundCount =
      Number(settlement.refundCount || 0) + 1;

    settlement.outstandingAmount =
      Math.max(

        0,

        Number(settlement.netAmount) -
        Number(settlement.refundAmount)

      );

    if (
      settlement.outstandingAmount === 0
    ) {

      settlement.status =
        "refunded";

    }

    return await settlement.save();

  }

}

module.exports =
  new SettlementRepository();
