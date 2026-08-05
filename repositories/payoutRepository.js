const Payout =
  require("../models/Payout");

class PayoutRepository {

  // ======================================
  // CREATE PAYOUT
  // ======================================

  async create(data) {

    return await Payout.create(
      data
    );

  }

  // ======================================
  // GET PAYOUT
  // ======================================

  async findById(id) {

    return await Payout.findById(id)
      .populate("merchant")
      .populate("settlements");

  }

  // ======================================
  // GET MERCHANT PAYOUTS
  // ======================================

  async findByMerchant(
    merchantId
  ) {

    return await Payout.find({

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

    payoutId,

    status

  ) {

    return await Payout.findByIdAndUpdate(

      payoutId,

      {

        status,

        processedAt:

          status === "completed"
            ? new Date()
            : undefined,

      },

      {

        new: true,

        returnDocument:
          "after",

      }

    );

  }

    // ======================================
  // PROCESS PAYOUT
  // ======================================

  async processPayout(

    payoutId,

    payoutReference

  ) {

    return await Payout.findByIdAndUpdate(

      payoutId,

      {

        status: "processing",

        payoutReference,

      },

      {

        new: true,

        returnDocument: "after",

      }

    );

  }

  // ======================================
// COMPLETE PAYOUT
// ======================================

async completePayout(

  payoutId

) {

  return await Payout.findByIdAndUpdate(

    payoutId,

    {

      status: "completed",

      processedAt: new Date(),

    },

    {

      new: true,

      returnDocument: "after",

    }

  );

}

// ======================================
// MARK PAID
// ======================================

async markPaid(

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

}



module.exports =
  new PayoutRepository();