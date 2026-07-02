const Checkout = require("../../models/Checkout");

const generateSlug =
  require("../../utils/slugGenerator");

module.exports = async function createCheckout(
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

    // ===============================
    // VALIDATION
    // ===============================

    if (!title?.trim()) {
      return res.status(400).json({
        error: "Title is required.",
      });
    }

    if (
      amount === undefined ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({
        error:
          "Amount must be greater than zero.",
      });
    }

    // ===============================
    // CREATE CHECKOUT
    // ===============================

    const checkout =
      await Checkout.create({
        merchantId:
          req.user.merchantId,

        createdBy:
          req.user._id,

        title:
          title.trim(),

        description:
          description || "",

        amount:
          Number(amount),

        currency:
          currency || "USD",

        slug:
          generateSlug(title),
      });

    return res.status(201).json({
      success: true,

      message:
        "Checkout created successfully.",

      checkout,

      paymentUrl:
`${process.env.FRONTEND_URL}/pay/${checkout.slug}`,
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error:
        "Failed to create checkout.",
    });

  }
};