const merchantSettingsService =
  require("../services/merchantSettingsService");

// ======================================
// GET SETTINGS
// ======================================

exports.getSettings =
  async (req, res) => {

    try {

      const settings =
        await merchantSettingsService.getSettings(
          req.merchant._id
        );

      if (!settings) {

        return res.status(404).json({
          error: "Merchant not found",
        });

      }

      res.json({
        defaultCurrency:
          settings.defaultCurrency,

        emailNotifications:
          settings.emailNotifications,

        paymentNotifications:
          settings.paymentNotifications,

        marketingEmails:
          settings.marketingEmails,
      });

    } catch (err) {

      res.status(500).json({
        error: "Failed to load merchant settings",
      });

    }

  };

// ======================================
// UPDATE SETTINGS
// ======================================

exports.updateSettings =
  async (req, res) => {

    try {

      const settings =
        await merchantSettingsService.updateSettings(

          req.merchant._id,

          {
            defaultCurrency:
              req.body.defaultCurrency,

            emailNotifications:
              req.body.emailNotifications,

            paymentNotifications:
              req.body.paymentNotifications,

            marketingEmails:
              req.body.marketingEmails,
          }

        );

      res.json({
        success: true,
        settings,
      });

    } catch (err) {

      res.status(500).json({
        error: "Failed to update merchant settings",
      });

    }

  };
