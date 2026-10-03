const crypto = require("node:crypto");

const DERIVATION_VERSION = "provider-idempotency-v1";
const OUTPUT_PREFIX = "ap_pay_v1_";

function deriveProviderIdempotencyKey({ merchantId, endpoint, idempotencyKey }) {
  const secret = process.env.PROVIDER_IDEMPOTENCY_HMAC_SECRET;
  if (!secret) {
    throw new Error("Provider idempotency HMAC secret is not configured.");
  }

  const normalizedMerchantId = String(merchantId || "").trim();
  const normalizedEndpoint = String(endpoint || "").trim();
  const normalizedIdempotencyKey = String(idempotencyKey || "");
  if (!normalizedMerchantId || !normalizedEndpoint || !normalizedIdempotencyKey) {
    throw new TypeError("Provider idempotency context is incomplete.");
  }

  const canonical = JSON.stringify([
    DERIVATION_VERSION,
    normalizedMerchantId,
    normalizedEndpoint,
    normalizedIdempotencyKey,
  ]);

  const digest = crypto
    .createHmac("sha256", secret)
    .update(canonical)
    .digest("base64url");

  return `${OUTPUT_PREFIX}${digest}`;
}

module.exports = {
  DERIVATION_VERSION,
  deriveProviderIdempotencyKey,
};
