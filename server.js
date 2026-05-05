require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use("/stripe", stripeWebhookRoutes);
// 🔥 MIDDLEWARE
app.use(express.json());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://aurapay-dashboard.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (
        origin.startsWith("https://aurapay-dashboard-") &&
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// 🔌 LOAD ROUTES
console.log("🔌 Loading routes...");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const walletRoutes = require("./routes/walletRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const stripeRoutes = require("./routes/stripeRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const providerAnalyticsRoutes = require("./routes/providerAnalyticsRoutes");
const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");
const paypalCheckoutRoutes = require("./routes/paypalCheckoutRoutes");

// ✅ MOUNT ROUTES
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/wallet", paymentRoutes);
app.use("/wallet", walletRoutes);
app.use("/payments", paymentRoutes);
app.use("/onboarding", onboardingRoutes);
app.use("/stripe", stripeRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/paypal-checkout", paypalCheckoutRoutes);
app.use("/provider-analytics", providerAnalyticsRoutes);
console.log("✅ Routes loaded");

// 🏠 ROOT ROUTE
app.get("/", (req, res) => {
  res.send("🚀 AuraPay API is running");
});

// 🔗 DB CONNECT
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ DB Error:", err));

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});