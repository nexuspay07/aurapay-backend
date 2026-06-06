require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");

const http = require("http");

const { Server } = require("socket.io");

const app = express();

const server =
  http.createServer(app);

  const settlementRoutes =
  require(
    "./routes/settlementRoutes"
  );

  const paymentCompletionRoutes =
  require(
    "./routes/paymentCompletionRoutes"
  );

  const checkoutRoutes =
  require(
    "./routes/checkoutRoutes"
  );

  const transactionRoutes =
  require(
    "./routes/transactionRoutes"
  );

  // ======================================
// SOCKET.IO
// ======================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

global.io = io;

// CONNECTION

io.on("connection", (socket) => {
  console.log(
    "⚡ Admin connected:",
    socket.id
  );

  socket.on(
    "disconnect",
    () => {
      console.log(
        "❌ Admin disconnected:",
        socket.id
      );
    }
  );
});

// ======================================
// IMPORT ROUTES
// ======================================

const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");

const adminRoutes = require("./routes/adminRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const auditRoutes = require(
  "./routes/auditRoutes"
);

let authRoutes;

try {
  authRoutes = require("./routes/authRoutes");
  console.log("✅ authRoutes loaded");
} catch (err) {
  console.log("❌ authRoutes failed");
  console.log(err);
}

const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const walletRoutes = require("./routes/walletRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const stripeRoutes = require("./routes/stripeRoutes");
const providerAnalyticsRoutes = require("./routes/providerAnalyticsRoutes");
const paypalCheckoutRoutes = require("./routes/paypalCheckoutRoutes");
const merchantRoutes =
  require("./routes/merchantRoutes");

  const checkoutOperationsRoutes =
  require(
    "./routes/checkoutOperationsRoutes"
  );

// ======================================
// CORS CONFIG
// ======================================

// ======================================
// CORS CONFIG
// ======================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",

  "https://aurapay-dashboard.vercel.app",
];

app.use(
  cors({
    origin: function (
      origin,
      callback
    ) {
      // Postman / server-to-server
      if (!origin) {
        return callback(
          null,
          true
        );
      }

      // Local development
      if (
        allowedOrigins.includes(
          origin
        )
      ) {
        return callback(
          null,
          true
        );
      }

      // Allow ALL Vercel deployments
      if (
        origin.endsWith(
          ".vercel.app"
        )
      ) {
        return callback(
          null,
          true
        );
      }

      console.log(
        "Blocked by CORS:",
        origin
      );

      return callback(
        new Error(
          "Not allowed by CORS"
        )
      );
    },

    credentials: true,
  })
);

// ======================================
// STRIPE WEBHOOK
// MUST STAY BEFORE express.json()
// ======================================

app.use(
  "/stripe",
  stripeWebhookRoutes
);

// ======================================
// BODY PARSERS
// MUST COME BEFORE ROUTES
// ======================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ======================================
// EARLY ROUTES
// ======================================

app.use(
  "/checkouts",
  checkoutRoutes
);

app.use(
  "/transactions",
  transactionRoutes
);

app.use(
  "/checkout-ops",
  checkoutOperationsRoutes
);

app.use(
  "/payment-completion",
  paymentCompletionRoutes
);

app.use(
  "/settlements",
  settlementRoutes
);

app.use(
  "/merchants",
  merchantRoutes
);

app.use(
  "/audit",
  auditRoutes
);

// ======================================
// MAIN ROUTES
// ======================================

console.log(
  "🔌 Loading routes..."
);

// AUTH

app.use(
  "/auth",
  authRoutes
);

// ADMIN AUTH

app.use(
  "/admin-auth",
  adminAuthRoutes
);

app.use(
  "/api/admin-auth",
  adminAuthRoutes
);

// ADMIN

app.use(
  "/admin",
  adminRoutes
);

// USER

app.use(
  "/user",
  userRoutes
);

// WALLET

app.use(
  "/wallet",
  walletRoutes
);

// PAYMENTS

app.use(
  "/payments",
  paymentRoutes
);

// ONBOARDING

app.use(
  "/onboarding",
  onboardingRoutes
);

// STRIPE API ROUTES

app.use(
  "/stripe",
  stripeRoutes
);

// CHECKOUT

app.use(
  "/checkout",
  checkoutRoutes
);

// PAYPAL

app.use(
  "/paypal-checkout",
  paypalCheckoutRoutes
);

// PROVIDER ANALYTICS

app.use(
  "/provider-analytics",
  providerAnalyticsRoutes
);

// ANALYTICS

app.use(
  "/analytics",
  analyticsRoutes
);

console.log(
  "✅ Routes loaded"
);
// ======================================
// ROOT ROUTE
// ======================================

app.get("/", (req, res) => {
  res.send(
    "🚀 AuraPay API is running"
  );
});

// ======================================
// DATABASE CONNECTION
// ======================================

mongoose
  .connect(process.env.MONGO_URI)
  .then(() =>
    console.log(
      "✅ MongoDB Connected"
    )
  )
  .catch((err) =>
    console.log(
      "❌ DB Error:",
      err
    )
  );

// ======================================
// START SERVER
// ======================================

const PORT =
  process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});