const transactionRepository =
  require("../repositories/transactionRepository");

class ReconciliationService {

  // ======================================
  // RECONCILE TRANSACTION
  // ======================================

  async reconcileTransaction(
    transactionId
  ) {

    throw new Error(
      "Provider reconciliation not implemented."
    );

  }

}

module.exports =
  new ReconciliationService();