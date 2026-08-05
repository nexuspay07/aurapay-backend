const merchantProfileService =
  require("../services/merchantProfileService");

// ======================================
// GET MERCHANT PROFILE
// ======================================

exports.getProfile = async (req, res) => {
  try {
    const merchant =
      await merchantProfileService.getProfile(
        req.user.merchantId
      );

    if (!merchant) {
      return res.status(404).json({
        success: false,
        error: "Merchant not found.",
      });
    }

    return res.json(merchant);
  } catch (err) {
    console.error(
      "Merchant Profile Error:",
      err
    );

    return res.status(500).json({
      success: false,
      error: "Failed to load merchant profile.",
    });
  }
};

// ======================================
// UPDATE MERCHANT PROFILE
// ======================================

exports.updateProfile = async (req, res) => {
  try {
    const merchant =
      await merchantProfileService.updateProfile(
        req.user.merchantId,
        req.body
      );

    if (!merchant) {
      return res.status(404).json({
        success: false,
        error: "Merchant not found.",
      });
    }

    return res.json({
      success: true,
      message:
        "Merchant profile updated successfully.",
      merchant,
    });
  } catch (err) {
    console.error(
      "Merchant Update Error:",
      err
    );

    return res.status(500).json({
      success: false,
      error: "Failed to update merchant profile.",
    });
  }
};