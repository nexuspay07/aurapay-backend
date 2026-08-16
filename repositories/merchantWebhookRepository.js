const MerchantWebhook =
  require("../models/MerchantWebhook");

class MerchantWebhookRepository {

  // ======================================
  // CREATE
  // ======================================

  async create(data) {

    return await MerchantWebhook.create(data);

  }

  // ======================================
  // FIND BY ID
  // ======================================

  async findById(id) {

    return await MerchantWebhook.findById(id);

  }

  // ======================================
  // FIND BY MERCHANT
  // ======================================

  async findByMerchant(merchantId) {

    return await MerchantWebhook.find({

      merchant: merchantId,

    });

  }

  // ======================================
  // FIND ACTIVE
  // ======================================

  async findActive(merchantId) {

    return await MerchantWebhook.find({

      merchant: merchantId,

      active: true,

    }).select("+secret");

  }

  // ======================================
  // UPDATE
  // ======================================

  async update(id, updates) {

    return await MerchantWebhook.findByIdAndUpdate(

      id,

      updates,

      {

        new: true,

        returnDocument: "after",

      }

    );

  }

  // ======================================
  // DELETE
  // ======================================

  async delete(id) {

    return await MerchantWebhook.findByIdAndDelete(id);

  }

}

module.exports =
  new MerchantWebhookRepository();
