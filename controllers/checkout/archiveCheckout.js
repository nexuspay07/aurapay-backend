const Checkout =
  require("../../models/Checkout");
const mongoose = require("mongoose");

module.exports =
  async function archiveCheckout(
    req,
    res
  ) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID.",
        });
      }

      // ======================================
      // FIND CHECKOUT
      // ======================================

      const checkout =
        await Checkout.findById(
          req.params.id
        );

      if (!checkout) {

        return res.status(404).json({

          success: false,

          error:
            "Checkout not found.",

        });

      }

      // ======================================
      // VERIFY MERCHANT
      // ======================================

      if (

        checkout.merchantId.toString() !==
        req.merchant._id.toString()

      ) {

        return res.status(403).json({

          success: false,

          error:
            "Access denied.",

        });

      }

      // ======================================
      // ALREADY ARCHIVED
      // ======================================

      if (
        checkout.status === "inactive"
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Checkout is already archived.",

        });

      }

      // ======================================
      // ARCHIVE
      // ======================================

      checkout.status = "inactive";

      await checkout.save();

      // ======================================
      // RESPONSE
      // ======================================

      return res.json({

        success: true,

        message:
          "Checkout archived successfully.",

        checkout,

      });

    } catch (err) {

      return res.status(500).json({

        success: false,

        error:
          "Failed to archive checkout.",

      });

    }

  };
