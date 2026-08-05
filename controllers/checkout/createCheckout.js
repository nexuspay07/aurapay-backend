const Checkout =
  require("../../models/Checkout");

const generateSlug =
  require("../../utils/slugGenerator");

module.exports =
  async function createCheckout(
    req,
    res
  ) {
    try {

      const {
        title,
        description,
        amount,
        currency,
      } = req.body;

      // ======================================
      // VALIDATION
      // ======================================

      if (!title || !title.trim()) {

        return res.status(400).json({
          success: false,
          error: "Title is required.",
        });

      }

      if (
        amount === undefined ||
        Number(amount) <= 0
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Amount must be greater than zero.",
        });

      }

      // ======================================
      // CREATE CHECKOUT
      // ======================================

      const checkout =
        await Checkout.create({

          merchantId:
            req.merchant._id,

          title:
            title.trim(),

          description:
            description || "",

          amount:
            Number(amount),

          currency:
            currency || "USD",

          status:
            "active",

          slug:
            generateSlug(title),

        });

      // ======================================
      // RESPONSE
      // ======================================

      return res.status(201).json({

        success: true,

        message:
          "Checkout created successfully.",

        checkout,

        paymentUrl:
`${process.env.FRONTEND_URL}/pay/${checkout.slug}`,

      });

    } catch (err) {

      console.error(
        "[CREATE CHECKOUT]",
        err
      );

      return res.status(500).json({

        success: false,

        error:
          "Failed to create checkout.",

      });

    }

  };