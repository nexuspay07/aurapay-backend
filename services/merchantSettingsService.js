const merchantSettingsRepository =
  require("../repositories/merchantSettingsRepository");

class MerchantSettingsService {

  async getSettings(merchantId) {

    return await merchantSettingsRepository.getSettings(
      merchantId
    );

  }

  async updateSettings(
    merchantId,
    settings
  ) {

    return await merchantSettingsRepository.updateSettings(
      merchantId,
      settings
    );

  }

}

module.exports =
  new MerchantSettingsService();