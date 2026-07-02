const Checkout = require("../../models/Checkout");

module.exports = async function getCheckout(
  req,
  res
) {
  try {
    const checkout =
      await Checkout.findOne({
        slug: req.params.slug,
      }).populate(
        "merchantId",
        "businessName legalName"
      );

    if (!checkout) {
      return res.status(404).json({
        error: "Checkout not found.",
      });
    }

    if (checkout.status !== "active") {
      return res.status(404).json({
        error: "Checkout is unavailable.",
      });
    }

    if (
      checkout.expiresAt &&
      checkout.expiresAt <= new Date()
    ) {
      return res.status(410).json({
        error: "Checkout has expired.",
      });
    }

    if (
      checkout.maxUses > 0 &&
      checkout.currentUses >=
        checkout.maxUses
    ) {
      return res.status(410).json({
        error:
          "Checkout usage limit reached.",
      });
    }

    return res.json({
      success: true,
      checkout,
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error:
        "Failed to load checkout.",
    });

  }
};