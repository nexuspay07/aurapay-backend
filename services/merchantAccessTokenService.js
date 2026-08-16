const jwt = require("jsonwebtoken");

const { isMerchantRole } = require("./merchantSessionSecurity");

function createAccessToken(user, secret = process.env.JWT_SECRET) {
  const payload = {
    id: user._id,
    role: user.role,
    merchantId: user.merchantId,
  };

  if (isMerchantRole(user.role)) {
    payload.merchantSecurityVersion = Number(
      user.merchantSecurityVersion || 0
    );
  }

  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

module.exports = { createAccessToken };
