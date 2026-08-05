const bcrypt =
  require("bcrypt");

const apiKeyRepository =
  require("../repositories/apiKeyRepository");

const ApiLog =
  require("../models/ApiLog");
const Merchant =
  require("../models/Merchant");

const SENSITIVE_FIELDS = [
  "authorization",
  "password",
  "secret",
  "secretKey",
  "secret_key",
  "token",
  "refreshToken",
  "apiKey",
];

function sanitize(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  return Object.entries(value).reduce((safe, [key, item]) => {
    if (
      SENSITIVE_FIELDS.some(
        (field) => field.toLowerCase() === key.toLowerCase()
      )
    ) {
      safe[key] = "[redacted]";
      return safe;
    }

    safe[key] = sanitize(item);
    return safe;
  }, {});
}

module.exports = async (

  req,

  res,

  next

) => {

  try {

    const authorization =

      req.headers.authorization;

    const startedAt = Date.now();
    const requestId =
      req.headers["x-request-id"] ||
      `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    if (

      !authorization ||

      !authorization.startsWith("Bearer ")

    ) {

      return res.status(401).json({

        success: false,
        error: {
          code: "unauthorized",
          message: "Authorization header missing.",
        },

      });

    }

    const secretKey =

      authorization.replace(

        "Bearer ",

        ""

      );

    // Match the prefix length you chose in apiKeyService.js
    const secretKeyPrefix =
      secretKey.substring(0, 16);

    const apiKey =

      await apiKeyRepository.findBySecretKeyPrefix(

        secretKeyPrefix

      );

    if (!apiKey) {

      return res.status(401).json({
        success: false,
        error: {
          code: "unauthorized",
          message: "Invalid API key.",
        },
      });

    }

    if (!apiKey.active) {

      return res.status(401).json({
        success: false,
        error: {
          code: "unauthorized",
          message: "API key is inactive.",
        },
      });

    }

    if (

      apiKey.expiresAt &&

      apiKey.expiresAt < new Date()

    ) {

      return res.status(401).json({
        success: false,
        error: {
          code: "unauthorized",
          message: "API key expired.",
        },
      });

    }

    const valid =

      await bcrypt.compare(

        secretKey,

        apiKey.secretKeyHash

      );

    if (!valid) {

      return res.status(401).json({
        success: false,
        error: {
          code: "unauthorized",
          message: "Invalid API key.",
        },
      });

    }

    if (
      apiKey.environment !== "sandbox" ||
      !secretKey.startsWith("sk_test_")
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code: "unauthorized",
          message: "Only sandbox API keys are accepted.",
        },
      });
    }

    const merchant =
      await Merchant.findById(apiKey.merchant);

    if (!merchant || merchant.active === false) {
      return res.status(401).json({
        success: false,
        error: {
          code: "unauthorized",
          message: "Merchant account is inactive.",
        },
      });
    }

    await apiKeyRepository.updateLastUsed(

      apiKey._id

    );

    res.on("finish", () => {
      ApiLog.create({
        merchant: apiKey.merchant,
        apiKey: apiKey._id,
        endpoint: req.originalUrl || req.url,
        method: req.method,
        status: res.statusCode,
        latencyMs: Date.now() - startedAt,
        ip: req.ip || req.socket?.remoteAddress || "",
        environment: apiKey.environment,
        userAgent: req.headers["user-agent"] || "",
        requestId,
        sanitizedRequest: {
          query: sanitize(req.query),
          body: sanitize(req.body),
        },
        sanitizedResponse: res.locals.apiResponseSummary || {},
      }).catch(() => {});
    });

    req.apiKey = apiKey;

    req.merchant = merchant;

    req.environment = "sandbox";

    next();

  }

  catch (error) {

    return res.status(500).json({

      success: false,
      error: {
        code: "internal_error",
        message: "Authentication failed.",
      },

    });

  }

};
