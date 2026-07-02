const Checkout = require("../models/Checkout");

// ======================================
// CREATE CHECKOUT
// ======================================

// ======================================
// CREATE CHECKOUT
// ======================================

exports.createCheckout = async (req, res) => {
  try {
    const {
      title,
      description,
      amount,
      currency,
    } = req.body;

    // -----------------------------
    // VALIDATION
    // -----------------------------

    if (!title) {
      return res.status(400).json({
        error: "Checkout title is required.",
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        error: "A valid amount is required.",
      });
    }

    // -----------------------------
    // GENERATE UNIQUE SLUG
    // -----------------------------

    const random =
      Math.random()
        .toString(36)
        .substring(2, 8);

    const slug =
      title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      random;

    // -----------------------------
    // CREATE CHECKOUT
    // -----------------------------

    const checkout =
      await Checkout.create({
        merchantId:
          req.user.merchantId,

        title,

        description:
          description || "",

        amount:
          Number(amount),

        currency:
          currency || "USD",

        slug,
      });

    // -----------------------------
    // SUCCESS
    // -----------------------------

    res.status(201).json({
      success: true,

      message:
        "Checkout created successfully.",

      checkout,

      checkoutUrl:
        `${process.env.FRONTEND_URL}/pay/${slug}`,
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error:
        err.message,
    });

  }
};

// ======================================
// GET CHECKOUT
// ======================================

exports.getCheckout = async (req, res) => {
  try {
    // TODO
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};

// ======================================
// UPDATE CHECKOUT
// ======================================

exports.updateCheckout = async (req, res) => {
  try {
    // TODO
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};

// ======================================
// DELETE CHECKOUT
// ======================================

exports.deleteCheckout = async (req, res) => {
  try {
    // TODO
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};

// ======================================
// LIST MERCHANT CHECKOUTS
// ======================================

exports.listMerchantCheckouts = async (
  req,
  res
) => {
  try {
    // TODO
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};

// ======================================
// PUBLISH CHECKOUT
// ======================================

exports.publishCheckout = async (
  req,
  res
) => {
  try {
    // TODO
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};

// ======================================
// ARCHIVE CHECKOUT
// ======================================

exports.archiveCheckout = async (
  req,
  res
) => {
  try {
    // TODO
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};