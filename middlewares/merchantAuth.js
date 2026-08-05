const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const Merchant = require("../models/Merchant");

module.exports = async function merchantAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "No authentication token provided.",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({
        success: false,
        error: "Invalid authentication token.",
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found.",
      });
    }

    if (!["merchant_owner", "merchant_staff"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: "Merchant access required.",
      });
    }

    if (!user.merchantId) {
      return res.status(404).json({
        success: false,
        error: "Merchant account not linked.",
      });
    }

    const merchant = await Merchant.findById(user.merchantId);

    if (!merchant) {
      return res.status(404).json({
        success: false,
        error: "Merchant not found.",
      });
    }

    req.user = user;
    req.merchant = merchant;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Invalid authentication token.",
    });
  }
};
