const Checkout = require("../../models/Checkout");

module.exports = async function updateCheckout(
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

    // Merchant ownership check
    if (
      checkout.merchantId.toString() !==
      req.user.merchantId.toString()
    ) {
      return res.status(403).json({
        error: "Access denied.",
      });
    }

    const {
      title,
      description,
      amount,
      currency,
      status,
      successUrl,
      cancelUrl,
      requireEmail,
      requireName,
      requirePhone,
    } = req.body;

    if (title !== undefined)
      checkout.title = title;

    if (description !== undefined)
      checkout.description = description;

    if (amount !== undefined)
      checkout.amount = Number(amount);

    if (currency !== undefined)
      checkout.currency = currency;

    if (status !== undefined)
      checkout.status = status;

    if (successUrl !== undefined)
      checkout.successUrl =
        successUrl;

    if (cancelUrl !== undefined)
      checkout.cancelUrl =
        cancelUrl;

    if (requireEmail !== undefined)
      checkout.requireEmail =
        requireEmail;

    if (requireName !== undefined)
      checkout.requireName =
        requireName;

    if (requirePhone !== undefined)
      checkout.requirePhone =
        requirePhone;

    checkout.updatedBy =
      req.user._id;

    await checkout.save();

    return res.json({
      success: true,
      message:
        "Checkout updated successfully.",
      checkout,
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error:
        "Failed to update checkout.",
    });

  }
};