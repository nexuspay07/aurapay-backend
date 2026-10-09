require("dotenv").config();

const express = require("express");

const corsConfig =
  require("./config/cors");

const registerRoutes =
  require("./routes");

const apiKeyRoutes =
  require("./routes/apiKeyRoutes");

const app = express();

const stripeExternalWebhookRoutes =
  require("./routes/stripeExternalWebhookRoutes");

console.log("1 - Express app created");

app.get("/health", (req, res) => {
  return res.json({
    success: true,
    status: "ok",
  });
});

// ======================================
// CORS
// ======================================

app.use(corsConfig);

console.log("3 - CORS registered");

// ======================================
// BODY PARSERS
// ======================================

const STRIPE_EXTERNAL_WEBHOOK_PATH =
  "/api/provider-webhooks/stripe/test";

app.use(
  STRIPE_EXTERNAL_WEBHOOK_PATH,
  express.raw({
    type: "application/json",
    limit: "256kb",
  }),
  stripeExternalWebhookRoutes
);

app.use(
  STRIPE_EXTERNAL_WEBHOOK_PATH,
  (err, req, res, next) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        error: {
          code: "payload_too_large",
          message: "Webhook payload exceeds the allowed size.",
        },
      });
    }

    return next(err);
  }
);

app.use(express.json());

console.log("4 - JSON parser registered");

app.use(
  express.urlencoded({
    extended: true,
  })
);

console.log("5 - URL Encoded parser registered");

app.use((err, req, res, next) => {
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    "body" in err
  ) {
    return res.status(400).json({
      success: false,
      error: { code: "MALFORMED_JSON", message: "Malformed JSON." },
    });
  }

  next(err);
});

const applicationRoutes =
  require("./routes/applicationRoutes");

app.use(
  "/applications",
  applicationRoutes
);

// ======================================
// API KEY ROUTES
// ======================================
console.log("6 - Mounting /apikeys");

app.use("/apikeys", apiKeyRoutes);

console.log("7 - /apikeys mounted");

// ======================================
// OTHER ROUTES
// ======================================
app.use((req, res, next) => {

  console.log("8 - After /apikeys");

  next();

  

});

registerRoutes(app);

app.use((err, req, res, next) => {
  console.error("Unhandled application error");

  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error." },
  });
});
// ======================================
// EXPORT
// ======================================

module.exports = app;
