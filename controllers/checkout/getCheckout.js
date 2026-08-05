const Checkout =
  require("../../models/Checkout");

module.exports =
  async function getCheckout(
    req,
    res
  ) {
    try {

      // ======================================
      // FIND CHECKOUT
      // ======================================

      const checkout =
        await Checkout.findOne({

          slug:
            req.params.slug,

        }).populate(

          "merchantId",

          "businessName legalName"

        );

      if (!checkout) {

        return res.status(404).json({

          success: false,

          error:
            "Checkout not found.",

        });

      }

      // ======================================
      // STATUS CHECK
      // ======================================

      if (
        checkout.status !== "active"
      ) {

        return res.status(404).json({

          success: false,

          error:
            "Checkout is unavailable.",

        });

      }

      // ======================================
      // EXPIRATION
      // ======================================

      if (

        checkout.expiresAt &&

        checkout.expiresAt <=
          new Date()

      ) {

        return res.status(410).json({

          success: false,

          error:
            "Checkout has expired.",

        });

      }

      // ======================================
      // USAGE LIMIT
      // ======================================

      if (

        checkout.maxUses > 0 &&

        checkout.currentUses >=
          checkout.maxUses

      ) {

        return res.status(410).json({

          success: false,

          error:
            "Checkout usage limit reached.",

        });

      }

      // ======================================
      // RESPONSE
      // ======================================

      return res.json({

        success: true,

        checkout,

      });

    } catch (err) {

      console.error(
        "[GET CHECKOUT]",
        err
      );

      return res.status(500).json({

        success: false,

        error:
          "Failed to load checkout.",

      });

    }

  };