require("dotenv").config();

const express = require("express");

const corsConfig =
  require("./config/cors");

const registerRoutes =
  require("./routes");

const app = express();

// ======================================
// CORS
// ======================================

app.use(corsConfig);

// ======================================
// BODY PARSERS
// ======================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ======================================
// ROUTES
// ======================================

registerRoutes(app);

// ======================================
// ROOT
// ======================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    application:
      "AuraPay API",

    version: "1.0.0",

    status: "Running",

    timestamp:
      new Date(),
  });
});

// ======================================
// HEALTH
// ======================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      success: true,

      uptime:
        process.uptime(),

      timestamp:
        new Date(),
    });
  }
);

// ======================================
// 404
// ======================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,

    error:
      "Route not found.",
  });
});

// ======================================
// ERROR HANDLER
// ======================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(err);

    return res.status(
      err.status || 500
    ).json({
      success: false,

      error:
        err.message ||
        "Internal Server Error",
    });

  }
);

module.exports = app;