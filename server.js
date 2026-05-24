require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");

const app = express();

// ======================================
// IMPORT ROUTES
// ======================================

const stripeWebhookRoutes = require("./routes/stripeWebhookRoutes");

const adminRoutes = require("./routes/adminRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");

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
const checkoutRoutes = require("./routes/checkoutRoutes");
const providerAnalyticsRoutes = require("./routes/providerAnalyticsRoutes");
const paypalCheckoutRoutes = require("./routes/paypalCheckoutRoutes");

// ======================================
// CORS CONFIG
// ======================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://aurapay-dashboard.vercel.app",
  "https://aurapay-dashboard-74hxrc6vk-nexuspay07-5796s-projects.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
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

        // TEMPORARY DEBUG
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

app.use(
  "/stripe",
  stripeWebhookRoutes
);

// ======================================
// BODY PARSER
// ======================================

app.use(express.json());

// ======================================
// ROUTES
// ======================================

console.log("🔌 Loading routes...");

// AUTH
try {
  app.use("/auth", authRoutes);
  console.log("✅ auth mounted");
} catch (err) {
  console.log("❌ auth failed");
  console.log(err);
}

// ADMIN AUTH
try {
  app.use(
    "/admin-auth",
    adminAuthRoutes
  );

  console.log(
    "✅ admin-auth mounted"
  );
} catch (err) {
  console.log(
    "❌ admin-auth failed"
  );

  console.log(err);
}

// API ADMIN AUTH
try {
  app.use(
    "/api/admin-auth",
    adminAuthRoutes
  );

  console.log(
    "✅ api/admin-auth mounted"
  );
} catch (err) {
  console.log(
    "❌ api/admin-auth failed"
  );

  console.log(err);
}

// ADMIN
try {
  app.use("/admin", adminRoutes);

  console.log(
    "✅ admin mounted"
  );
} catch (err) {
  console.log(
    "❌ admin failed"
  );

  console.log(err);
}

// USER
try {
  app.use("/user", userRoutes);

  console.log(
    "✅ user mounted"
  );
} catch (err) {
  console.log(
    "❌ user failed"
  );

  console.log(err);
}

// WALLET
try {
  app.use("/wallet", walletRoutes);

  console.log(
    "✅ wallet mounted"
  );
} catch (err) {
  console.log(
    "❌ wallet failed"
  );

  console.log(err);
}

// PAYMENTS
try {
  app.use(
    "/payments",
    paymentRoutes
  );

  console.log(
    "✅ payments mounted"
  );
} catch (err) {
  console.log(
    "❌ payments failed"
  );

  console.log(err);
}

// ONBOARDING
try {
  app.use(
    "/onboarding",
    onboardingRoutes
  );

  console.log(
    "✅ onboarding mounted"
  );
} catch (err) {
  console.log(
    "❌ onboarding failed"
  );

  console.log(err);
}

// STRIPE
try {
  app.use("/stripe", stripeRoutes);

  console.log(
    "✅ stripe mounted"
  );
} catch (err) {
  console.log(
    "❌ stripe failed"
  );

  console.log(err);
}

// CHECKOUT
try {
  app.use(
    "/checkout",
    checkoutRoutes
  );

  console.log(
    "✅ checkout mounted"
  );
} catch (err) {
  console.log(
    "❌ checkout failed"
  );

  console.log(err);
}

// PAYPAL
try {
  app.use(
    "/paypal-checkout",
    paypalCheckoutRoutes
  );

  console.log(
    "✅ paypal mounted"
  );
} catch (err) {
  console.log(
    "❌ paypal failed"
  );

  console.log(err);
}

// PROVIDER ANALYTICS
try {
  app.use(
    "/provider-analytics",
    providerAnalyticsRoutes
  );

  console.log(
    "✅ provider analytics mounted"
  );
} catch (err) {
  console.log(
    "❌ provider analytics failed"
  );

  console.log(err);
}

// ANALYTICS
try {
  app.use(
    "/analytics",
    analyticsRoutes
  );

  console.log(
    "✅ analytics mounted"
  );
} catch (err) {
  console.log(
    "❌ analytics failed"
  );

  console.log(err);
}

console.log("✅ Routes loaded");

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

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});