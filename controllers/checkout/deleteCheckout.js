const Checkout = require("../../models/Checkout");

module.exports = async function deleteCheckout(
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

    await checkout.deleteOne();

    return res.json({
      success: true,
      message:
        "Checkout deleted successfully.",
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error:
        "Failed to delete checkout.",
    });

  }
};