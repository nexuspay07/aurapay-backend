const crypto = require("crypto");
const bcrypt = require("bcrypt");

const apiKeyRepository =
  require("../repositories/apiKeyRepository");

class ApiKeyService {

  // ======================================
  // CREATE API KEY
  // ======================================

  async createApiKey({

  merchant,

  name,

  environment = "sandbox",

  permissions = [],

  expiresAt = null,

}) {

  const keyEnvironment =
    environment === "sandbox"
      ? "test"
      : environment;

  const publicKey =
    `pk_${keyEnvironment}_` +
    crypto.randomBytes(16).toString("hex");

  const secretKey =
    `sk_${keyEnvironment}_` +
    crypto.randomBytes(32).toString("hex");

  const secretKeyPrefix =
    secretKey.substring(0, 16);

  const secretKeyHash =
    await bcrypt.hash(secretKey, 12);

  const apiKey =
    await apiKeyRepository.create({

      merchant,

      name,

      publicKey,

      secretKeyPrefix,

      secretKeyHash,

      environment,

      permissions,

      expiresAt,

    });

  return {

    apiKey,

    secretKey,

  };

}

  // ======================================
  // VALIDATE API KEY
  // ======================================

  async validateKey({

    publicKey,

    secretKey,

  }) {

    const apiKey =
      await apiKeyRepository.findByPublicKey(
        publicKey
      );

    if (!apiKey) {

      throw new Error(
        "Invalid API key."
      );

    }

    if (!apiKey.active) {

      throw new Error(
        "API key is inactive."
      );

    }

    if (

      apiKey.expiresAt &&

      apiKey.expiresAt < new Date()

    ) {

      throw new Error(
        "API key has expired."
      );

    }

    const valid =
      await bcrypt.compare(

        secretKey,

        apiKey.secretKeyHash

      );

    if (!valid) {

      throw new Error(
        "Invalid secret key."
      );

    }

    await apiKeyRepository.updateLastUsed(
      apiKey._id
    );

    return apiKey;

  }

  // ======================================
  // ROTATE API KEY
  // ======================================

  async rotateKey(apiKeyId) {

    const apiKey =
      await apiKeyRepository.findById(apiKeyId);

    if (!apiKey) {

      throw new Error(
        "API key not found."
      );

    }

    const keyEnvironment =
      apiKey.environment === "sandbox"
        ? "test"
        : apiKey.environment;

    const publicKey =
      `pk_${keyEnvironment}_` +
      crypto.randomBytes(16).toString("hex");

    const secretKey =
      `sk_${keyEnvironment}_` +
      crypto.randomBytes(32).toString("hex");

    const secretKeyPrefix =
      secretKey.substring(0, 16);

    const secretKeyHash =
      await bcrypt.hash(
        secretKey,
        12
      );

    const updated =
      await apiKeyRepository.rotate(

        apiKeyId,

        publicKey,

        secretKeyPrefix,

        secretKeyHash

      );

    return {

      apiKey: updated,

      secretKey,

    };

  }

  // ======================================
  // REVOKE
  // ======================================

  async revokeKey(apiKeyId) {

    return await apiKeyRepository.revoke(
      apiKeyId
    );

  }

  // ======================================
  // LIST
  // ======================================

  async listMerchantKeys(merchantId) {

    return await apiKeyRepository.findByMerchant(
      merchantId
    );

  }

}

module.exports =
  new ApiKeyService();
