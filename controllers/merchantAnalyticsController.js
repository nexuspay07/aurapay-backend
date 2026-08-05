const merchantAnalyticsService =
  require("../services/merchantAnalyticsService");

// ======================================
// MERCHANT DASHBOARD ANALYTICS
// ======================================

exports.getDashboard =
  async (req, res) => {

    try {

      const analytics =
        await merchantAnalyticsService.getDashboard(
          req.merchant._id
        );

      return res.json(
        analytics
      );

    } catch (err) {

      console.error(
        "Merchant Analytics Error:",
        err
      );

      return res.status(500).json({

        success: false,

        error:
          "Failed to load merchant analytics.",

      });

    }

  };