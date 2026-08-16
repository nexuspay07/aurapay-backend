const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const { createMerchantAuth } = require("../middlewares/merchantAuth");
const {
  canMerchantAuthenticate,
  isMerchantSessionAllowed,
} = require("../services/merchantSessionSecurity");
const { canUseSandboxApiKey } = require("../services/apiKeyAccessPolicy");
const { createAccessToken } = require("../services/merchantAccessTokenService");

const merchantId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const baseUser = {
  _id: userId,
  role: "merchant_owner",
  merchantId,
  status: "verified",
  emailVerified: true,
  frozen: false,
  merchantSecurityVersion: 3,
};
const baseMerchant = { _id: merchantId, active: true };

test("canonical merchant state allows only active verified unfrozen accounts", () => {
  assert.equal(canMerchantAuthenticate(baseUser, baseMerchant), true);
  assert.equal(canMerchantAuthenticate(null, baseMerchant), false);
  assert.equal(canMerchantAuthenticate(baseUser, null), false);
  assert.equal(canMerchantAuthenticate(baseUser, { ...baseMerchant, active: false }), false);
  assert.equal(canMerchantAuthenticate({ ...baseUser, frozen: true }, baseMerchant), false);
  assert.equal(canMerchantAuthenticate({ ...baseUser, lockedUntil: new Date(Date.now() + 60000) }, baseMerchant), false);
  assert.equal(canMerchantAuthenticate({ ...baseUser, status: "pending" }, baseMerchant), false);
  assert.equal(canMerchantAuthenticate({ ...baseUser, emailVerified: false }, baseMerchant), false);
  assert.equal(canMerchantAuthenticate({ ...baseUser, role: "user" }, baseMerchant), false);
});

test("merchant session requires a present exact security version", () => {
  assert.equal(isMerchantSessionAllowed({ merchantSecurityVersion: 3 }, baseUser, baseMerchant), true);
  assert.equal(isMerchantSessionAllowed({ merchantSecurityVersion: 2 }, baseUser, baseMerchant), false);
  assert.equal(isMerchantSessionAllowed({}, baseUser, baseMerchant), false);
  assert.equal(isMerchantSessionAllowed({ merchantSecurityVersion: "3" }, baseUser, baseMerchant), false);
});

function queryResult(value) {
  return { select: async () => value };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invokeMiddleware({ token, user = baseUser, merchant = baseMerchant }) {
  const UserModel = { findById: () => queryResult(user) };
  const MerchantModel = { findById: async () => merchant };
  const middleware = createMerchantAuth({ UserModel, MerchantModel, jwtLibrary: jwt });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = responseRecorder();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test("database-backed merchant middleware accepts matching current state", async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "merchant-session-test-secret";
  try {
    const token = jwt.sign(
      { id: userId, role: baseUser.role, merchantId, merchantSecurityVersion: 3 },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    );
    const result = await invokeMiddleware({ token });
    assert.equal(result.nextCalled, true);
    assert.equal(result.req.user, baseUser);
    assert.equal(result.req.merchant, baseMerchant);
  } finally {
    process.env.JWT_SECRET = previous;
  }
});

test("middleware returns the same safe 401 for all invalid merchant sessions", async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "merchant-session-test-secret";
  try {
    const sign = (claims, options = {}) => jwt.sign(
      { id: userId, role: "merchant_owner", merchantId, ...claims },
      process.env.JWT_SECRET,
      options
    );
    const cases = [
      { token: sign({ merchantSecurityVersion: 3 }), user: null },
      { token: sign({ merchantSecurityVersion: 3 }), merchant: null },
      { token: sign({ merchantSecurityVersion: 3 }), merchant: { ...baseMerchant, active: false } },
      { token: sign({ merchantSecurityVersion: 3 }), user: { ...baseUser, frozen: true } },
      { token: sign({ merchantSecurityVersion: 2 }) },
      { token: sign({}) },
      { token: sign({ merchantSecurityVersion: 3 }), user: { ...baseUser, role: "user" } },
      { token: jwt.sign({ id: userId, merchantSecurityVersion: 3 }, "forged-secret") },
      { token: sign({ merchantSecurityVersion: 3 }, { expiresIn: -1 }) },
    ];

    for (const item of cases) {
      const result = await invokeMiddleware(item);
      assert.equal(result.nextCalled, false);
      assert.equal(result.res.statusCode, 401);
      assert.deepEqual(result.res.body, {
        success: false,
        error: "Invalid authentication token.",
      });
    }
  } finally {
    process.env.JWT_SECRET = previous;
  }
});

test("fresh merchant access tokens contain the current merchant version", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "merchant-session-test-secret";
  try {
    const token = createAccessToken(baseUser);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(decoded.merchantSecurityVersion, 3);
    assert.equal(decoded.role, "merchant_owner");
  } finally {
    process.env.JWT_SECRET = previous;
  }
});

test("API-key policy remains independent but enforces merchant account state", () => {
  const apiKey = { active: true, environment: "sandbox", expiresAt: null };
  const input = {
    apiKey,
    secretKey: "sk_test_example",
    secretMatches: true,
    merchant: baseMerchant,
    owner: baseUser,
  };
  assert.equal(canUseSandboxApiKey(input), true);
  assert.equal(canUseSandboxApiKey({ ...input, apiKey: null }), false);
  assert.equal(canUseSandboxApiKey({ ...input, apiKey: { ...apiKey, active: false } }), false);
  assert.equal(canUseSandboxApiKey({ ...input, apiKey: { ...apiKey, expiresAt: new Date(Date.now() - 1) } }), false);
  assert.equal(canUseSandboxApiKey({ ...input, secretMatches: false }), false);
  assert.equal(canUseSandboxApiKey({ ...input, merchant: { ...baseMerchant, active: false } }), false);
  assert.equal(canUseSandboxApiKey({ ...input, owner: { ...baseUser, frozen: true } }), false);
  assert.equal(canUseSandboxApiKey({ ...input, secretKey: "sk_live_example" }), false);
});
