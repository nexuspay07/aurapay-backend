require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");

const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");

const adminRoutes = require("./routes/adminRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const walletRoutes = require("./routes/walletRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const stripeRoutes = require("./routes/stripeRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const providerAnalyticsRoutes = require("./routes/providerAnalyticsRoutes");
const paypalCheckoutRoutes = require("./routes/paypalCheckoutRoutes");

const app = express();

// ======================================
// CORS CONFIG
// ======================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://aurapay-dashboard.vercel.app",
  "https://aurapay-dashboard-74hxrc6vk-nexuspay07-5796s-projects.vercel.app",
];;

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin
      if (!origin) {
        return callback(null, true);
      }

      if (
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        console.log(
          "Blocked by CORS:",
          origin
        );

        // TEMPORARY:
        // allow all origins while debugging
        callback(null, true);
      }
    },

    credentials: true,
  })
);

// ======================================
// STRIPE WEBHOOK
// MUST COME BEFORE express.json()
// ======================================

app.use("/stripe", stripeWebhookRoutes);

// ======================================
// BODY PARSER
// ======================================

app.use(express.json());

// ======================================
// ROUTES
// ======================================

console.log("🔌 Loading routes...");

// Main routes
app.use("/auth", authRoutes);

app.use(
  "/admin-auth",
  adminAuthRoutes
);

app.use(
  "/api/admin-auth",
  adminAuthRoutes
);

app.use("/admin", adminRoutes);

app.use("/user", userRoutes);

app.use("/wallet", walletRoutes);

app.use("/payments", paymentRoutes);

app.use(
  "/onboarding",
  onboardingRoutes
);

app.use("/stripe", stripeRoutes);

app.use("/checkout", checkoutRoutes);

app.use(
  "/paypal-checkout",
  paypalCheckoutRoutes
);

app.use(
  "/provider-analytics",
  providerAnalyticsRoutes
);

app.use(
  "/analytics",
  analyticsRoutes
);

console.log("✅ Routes loaded");

// ======================================
// ROOT ROUTE
// ======================================

app.get("/", (req, res) => {
  res.send("🚀 AuraPay API is running");
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

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});