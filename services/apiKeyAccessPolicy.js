const { canMerchantAuthenticate } = require("./merchantSessionSecurity");

function canUseSandboxApiKey({
  apiKey,
  secretKey,
  secretMatches,
  merchant,
  owner,
  now = new Date(),
}) {
  return Boolean(
    apiKey &&
      apiKey.active === true &&
      (!apiKey.expiresAt || apiKey.expiresAt >= now) &&
      apiKey.environment === "sandbox" &&
      typeof secretKey === "string" &&
      secretKey.startsWith("sk_test_") &&
      secretMatches === true &&
      owner?.role === "merchant_owner" &&
      canMerchantAuthenticate(owner, merchant)
  );
}

module.exports = { canUseSandboxApiKey };
