const merchantRepository =
  require("../repositories/merchantRepository");

class MerchantProfileService {

  async getProfile(merchantId) {

    return await merchantRepository.getById(
      merchantId
    );

  }

  async updateProfile(
    merchantId,
    data
  ) {

    return await merchantRepository.update(
      merchantId,
      data
    );

  }

}

module.exports =
  new MerchantProfileService();