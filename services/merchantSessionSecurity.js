const MERCHANT_ROLES = Object.freeze(["merchant_owner", "merchant_staff"]);

function isMerchantRole(role) {
  return MERCHANT_ROLES.includes(role);
}

function canMerchantAuthenticate(user, merchant, now = new Date()) {
  return Boolean(
    user &&
      merchant &&
      isMerchantRole(user.role) &&
      user.merchantId &&
      String(user.merchantId) === String(merchant._id) &&
      user.status === "verified" &&
      user.emailVerified === true &&
      user.frozen !== true &&
      (!user.lockedUntil || new Date(user.lockedUntil) <= now) &&
      merchant.active !== false
  );
}

function hasCurrentMerchantSecurityVersion(decoded, user) {
  return Boolean(
    decoded &&
      Number.isInteger(decoded.merchantSecurityVersion) &&
      decoded.merchantSecurityVersion >= 0 &&
      decoded.merchantSecurityVersion ===
        Number(user?.merchantSecurityVersion || 0)
  );
}

function isMerchantSessionAllowed(decoded, user, merchant) {
  return (
    canMerchantAuthenticate(user, merchant) &&
    hasCurrentMerchantSecurityVersion(decoded, user)
  );
}

module.exports = {
  MERCHANT_ROLES,
  canMerchantAuthenticate,
  hasCurrentMerchantSecurityVersion,
  isMerchantRole,
  isMerchantSessionAllowed,
};
