const Checkout =
  require("../../models/Checkout");
const mongoose = require("mongoose");

module.exports =
  async function updateCheckout(
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
      // MERCHANT OWNERSHIP
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
      // UPDATE FIELDS
      // ======================================

      const {
        title,
        description,
        amount,
        currency,
        status,
      } = req.body;

      if (
        title !== undefined
      ) {

        checkout.title =
          title.trim();

      }

      if (
        description !== undefined
      ) {

        checkout.description =
          description;

      }

      if (
        amount !== undefined
      ) {

        checkout.amount =
          Number(amount);

      }

      if (
        currency !== undefined
      ) {

        checkout.currency =
          currency;

      }

      if (
        status !== undefined
      ) {

        checkout.status =
          status;

      }

      // ======================================
      // SAVE
      // ======================================

      await checkout.save();

      // ======================================
      // RESPONSE
      // ======================================

      return res.json({

        success: true,

        message:
          "Checkout updated successfully.",

        checkout,

      });

    } catch (err) {

      return res.status(500).json({

        success: false,

        error:
          "Failed to update checkout.",

      });

    }

  };
