require("dotenv").config();

const express = require("express");

const corsConfig =
  require("./config/cors");

const registerRoutes =
  require("./routes");

const apiKeyRoutes =
  require("./routes/apiKeyRoutes");

const app = express();

console.log("1 - Express app created");

app.get("/health", (req, res) => {
  return res.json({
    success: true,
    status: "ok",
  });
});

app.post("/test", (req, res) => {

  console.log("TEST ROUTE HIT");

  return res.json({

    success: true,

    message: "Test route works"

  });

});

app.get("/test", (req, res) => {

  console.log("GET TEST");

  res.json({
    success: true
  });

});

// ======================================
// CORS
// ======================================

app.use(corsConfig);

console.log("3 - CORS registered");

// ======================================
// STRIPE WEBHOOK (RAW BODY)
// Must come BEFORE express.json()
// ======================================

app.use(
  "/stripe/webhook",
  express.raw({
    type: "application/json",
  })
);

// ======================================
// BODY PARSERS
// ======================================

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
      message: "Malformed JSON.",
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
    message: "Internal server error.",
  });
});
// ======================================
// EXPORT
// ======================================

module.exports = app;
