const Merchant =
  require("../models/Merchant");

class MerchantSettingsRepository {

  async getSettings(merchantId) {

    return await Merchant.findById(
      merchantId
    );

  }

  async updateSettings(
  merchantId,
  settings
) {

  return await Merchant.findByIdAndUpdate(

    merchantId,

    {
      $set: {

        defaultCurrency:
          settings.defaultCurrency,

        emailNotifications:
          settings.emailNotifications,

        paymentNotifications:
          settings.paymentNotifications,

        marketingEmails:
          settings.marketingEmails,

      },
    },

    {
      new: true,
      runValidators: true,
    }

  );

}

}

module.exports =
  new MerchantSettingsRepository();