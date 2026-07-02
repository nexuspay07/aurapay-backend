const Checkout = require("../../models/Checkout");

module.exports = async function publishCheckout(
  req,
  res
) {
  try {
    const checkout =
      await Checkout.findById(
        req.params.id
      );

    if (!checkout) {
      return res.status(404).json({
        error: "Checkout not found.",
      });
    }

    if (
      checkout.merchantId.toString() !==
      req.user.merchantId.toString()
    ) {
      return res.status(403).json({
        error: "Access denied.",
      });
    }

    if (checkout.status === "active") {
      return res.status(400).json({
        error: "Checkout is already active.",
      });
    }

    checkout.status = "active";

    checkout.publishedAt =
      new Date();

    checkout.updatedBy =
      req.user._id;

    await checkout.save();

    return res.json({
      success: true,

      message:
        "Checkout published successfully.",

      checkout,
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error:
        "Failed to publish checkout.",
    });

  }
};