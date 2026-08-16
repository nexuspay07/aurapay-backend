const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Merchant = require("../models/Merchant");
const { ADMIN_ROLES } = require("../config/adminPermissions");
const { isMerchantRole, isMerchantSessionAllowed } =
  require("../services/merchantSessionSecurity");

module.exports = async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const user = await User.findById(decoded.id).select(
      "+adminSecurityVersion +merchantSecurityVersion"
    );
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (
      ADMIN_ROLES.includes(user.role) &&
      Number(decoded.adminSecurityVersion || 0) !==
        Number(user.adminSecurityVersion || 0)
    ) {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (isMerchantRole(user.role)) {
      if (!user.merchantId) {
        return res.status(401).json({ error: "Invalid token" });
      }
      const merchant = await Merchant.findById(user.merchantId);
      if (!isMerchantSessionAllowed(decoded, user, merchant)) {
        return res.status(401).json({ error: "Invalid token" });
      }
      req.merchant = merchant;
    }

    req.user = user;
    req.auth = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};
