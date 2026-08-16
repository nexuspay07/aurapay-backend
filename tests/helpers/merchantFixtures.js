const bcrypt = require("bcryptjs");
const Merchant = require("../../models/Merchant");
const User = require("../../models/User");
const apiKeyService = require("../../services/apiKeyService");
const { runId } = require("./testDatabase");

let sequence = 0;
function unique(label) {
  sequence += 1;
  return `${label}-${runId}-${sequence}`;
}

async function createActiveMerchant(overrides = {}) {
  const identity = unique("merchant");
  return Merchant.create({
    businessName: identity,
    legalName: `${identity} LLC`,
    businessType: "corporation",
    contactEmail: `${identity}@aurapay.test`,
    country: "CA",
    active: true,
    verificationStatus: "verified",
    ...overrides,
  });
}

async function createVerifiedMerchantOwner(merchant, overrides = {}) {
  const identity = unique("owner");
  return User.create({
    email: `${identity}@aurapay.test`,
    password: await bcrypt.hash("MerchantTest123!", 4),
    role: "merchant_owner",
    merchantId: merchant._id,
    status: "verified",
    emailVerified: true,
    frozen: false,
    lockedUntil: null,
    ...overrides,
  });
}

async function createVerifiedMerchantAccount({ merchant: merchantOverrides = {}, owner: ownerOverrides = {} } = {}) {
  const merchant = await createActiveMerchant(merchantOverrides);
  const owner = await createVerifiedMerchantOwner(merchant, ownerOverrides);
  return { merchant, owner };
}

async function createSandboxApiKey(merchant, overrides = {}) {
  return apiKeyService.createApiKey({
    merchant: merchant._id,
    name: unique("sandbox-key"),
    environment: "sandbox",
    permissions: [],
    ...overrides,
  });
}

module.exports = { createActiveMerchant, createSandboxApiKey, createVerifiedMerchantAccount, createVerifiedMerchantOwner };
