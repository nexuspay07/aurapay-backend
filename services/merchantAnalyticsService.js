const merchantAnalyticsRepository =
  require("../repositories/merchantAnalyticsRepository");

class MerchantAnalyticsService {

  // ======================================
  // DASHBOARD ANALYTICS
  // ======================================

  async getDashboard(
    merchantId
  ) {

    return await merchantAnalyticsRepository.getDashboard(
      merchantId
    );

  }

}

module.exports =
  new MerchantAnalyticsService();