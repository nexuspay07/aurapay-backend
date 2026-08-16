const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const Merchant = require("../models/Merchant");
const {
  isMerchantSessionAllowed,
} = require("../services/merchantSessionSecurity");

function unauthorized(res) {
  return res.status(401).json({
    success: false,
    error: "Invalid authentication token.",
  });
}

function createMerchantAuth(dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const MerchantModel = dependencies.MerchantModel || Merchant;
  const jwtLibrary = dependencies.jwtLibrary || jwt;

  return async function merchantAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return unauthorized(res);
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwtLibrary.verify(token, process.env.JWT_SECRET);

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return unauthorized(res);
    }

    const user = await UserModel.findById(decoded.id)
      .select("+merchantSecurityVersion");

    if (!user) {
      return unauthorized(res);
    }

    if (!user.merchantId) {
      return unauthorized(res);
    }

    const merchant = await MerchantModel.findById(user.merchantId);

    if (!isMerchantSessionAllowed(decoded, user, merchant)) {
      return unauthorized(res);
    }

    req.user = user;
    req.merchant = merchant;

    next();
  } catch (err) {
    return unauthorized(res);
  }
  };
}

const merchantAuth = createMerchantAuth();
module.exports = merchantAuth;
module.exports.createMerchantAuth = createMerchantAuth;
module.exports.unauthorized = unauthorized;
