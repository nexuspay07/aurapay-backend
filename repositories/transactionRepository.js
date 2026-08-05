const Transaction =
  require("../models/Transaction");

class TransactionRepository {

  // ======================================
  // CREATE TRANSACTION
  // ======================================

  async create(data) {

    return await Transaction.create(
      data
    );

  }

  // ======================================
  // GET BY PAYMENT INTENT
  // ======================================

  async findByPaymentIntent(

    paymentIntentId

  ) {

    return await Transaction.findOne({

      providerPaymentId:
        paymentIntentId,

    });

  }

  // ======================================
  // GET BY ID
  // ======================================

  async findById(id) {

    return await Transaction.findById(
      id
    );

  }

  // ======================================
// FIND BY PROVIDER PAYMENT ID
// ======================================

async findByProviderPaymentId(

  provider,

  providerPaymentId

) {

  return await Transaction.findOne({

    provider,

    providerPaymentId,

  });

}

  // ======================================
  // UPDATE STATUS
  // ======================================

  async updateStatus(

    id,

    status

  ) {

    return await Transaction.findByIdAndUpdate(

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
  new TransactionRepository();
