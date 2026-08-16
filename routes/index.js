module.exports = function registerRoutes(app) {

  // ======================================
  // ROUTE IMPORTS
  // ======================================

  const publicApiV1Routes =
    require("./api/v1");

  const authRoutes =
    require("./authRoutes");

  const adminAuthRoutes =
    require("./adminAuthRoutes");

  const adminRoutes =
    require("./adminRoutes");

  const userRoutes =
    require("./userRoutes");

  const merchantRoutes =
    require("./merchantRoutes");

  const checkoutRoutes =
    require("./checkoutRoutes");

  const checkoutOperationsRoutes =
    require("./checkoutOperationsRoutes");

  const walletRoutes =
    require("./walletRoutes");

  const transactionRoutes =
    require("./transactionRoutes");

  const settlementRoutes =
    require("./settlementRoutes");

  const onboardingRoutes =
    require("./onboardingRoutes");

  const analyticsRoutes =
    require("./analyticsRoutes");

  const providerAnalyticsRoutes =
    require("./providerAnalyticsRoutes");

  const merchantAnalyticsRoutes =
    require("./merchantAnalyticsRoutes");

  const adminAnalyticsRoutes =
    require("./adminAnalyticsRoutes");

  const merchantProfileRoutes =
  require("./merchantProfileRoutes"); 
  
  const merchantSettingsRoutes =
  require("./merchantSettingsRoutes");

  const merchantDeveloperRoutes =
    require("./merchantDeveloperRoutes");

  const auditRoutes =
    require("./auditRoutes");

  app.use(
    "/api/v1",
    publicApiV1Routes
  );

  // ======================================
  // AUTH
  // ======================================

  app.use("/auth", authRoutes);
  app.use("/api/auth", authRoutes);

  app.use(
    "/admin-auth",
    adminAuthRoutes
  );

  app.use(
    "/api/admin-auth",
    adminAuthRoutes
  );

  // ======================================
  // USERS
  // ======================================

  app.use("/user", userRoutes);
  app.use("/users", userRoutes);

  app.use("/api/user", userRoutes);
  app.use("/api/users", userRoutes);

  // ======================================
  // ADMIN
  // ======================================

  app.use("/admin", adminRoutes);
  app.use("/api/admin", adminRoutes);

  // ======================================
  // MERCHANTS
  // ======================================

  app.use(
    "/merchants",
    merchantRoutes
  );

  app.use(
    "/api/merchants",
    merchantRoutes
  );

  // ======================================
// MERCHANT PROFILE
// ======================================

app.use(
  "/merchant/profile",
  merchantProfileRoutes
);

app.use(
  "/api/merchant/profile",
  merchantProfileRoutes
);


// ======================================
// MERCHANT SETTINGS
// ======================================

app.use(
  "/merchant/settings",
  merchantSettingsRoutes
);

app.use(
  "/api/merchant/settings",
  merchantSettingsRoutes
);

app.use(
  "/merchant/developer",
  merchantDeveloperRoutes
);

app.use(
  "/api/merchant/developer",
  merchantDeveloperRoutes
);

  // ======================================
  // CHECKOUTS
  // ======================================

  app.use(
    "/checkout",
    checkoutRoutes
  );

  app.use(
    "/checkouts",
    checkoutRoutes
  );

  app.use(
    "/api/checkout",
    checkoutRoutes
  );

  app.use(
    "/api/checkouts",
    checkoutRoutes
  );

  app.use(
    "/checkout-ops",
    checkoutOperationsRoutes
  );

  app.use(
    "/api/checkout-ops",
    checkoutOperationsRoutes
  );

  // ======================================
  // WALLET
  // ======================================

  app.use(
    "/wallet",
    walletRoutes
  );

  app.use(
    "/api/wallet",
    walletRoutes
  );

  // ======================================
  // TRANSACTIONS
  // ======================================

  app.use(
    "/transactions",
    transactionRoutes
  );

  app.use(
    "/api/transactions",
    transactionRoutes
  );

  // ======================================
  // SETTLEMENTS
  // ======================================

  app.use(
    "/settlements",
    settlementRoutes
  );

  app.use(
    "/api/settlements",
    settlementRoutes
  );

  // ======================================
  // ONBOARDING
  // ======================================

  app.use(
    "/onboarding",
    onboardingRoutes
  );

  app.use(
    "/api/onboarding",
    onboardingRoutes
  );

  // ======================================
  // ANALYTICS
  // ======================================

  app.use(
    "/analytics",
    analyticsRoutes
  );

  app.use(
    "/api/analytics",
    analyticsRoutes
  );

  app.use(
    "/provider-analytics",
    providerAnalyticsRoutes
  );

  app.use(
    "/api/provider-analytics",
    providerAnalyticsRoutes
  );

  app.use(
    "/merchant-analytics",
    merchantAnalyticsRoutes
  );

  app.use(
    "/api/merchant-analytics",
    merchantAnalyticsRoutes
  );

  app.use(
    "/admin-analytics",
    adminAnalyticsRoutes
  );

  app.use(
    "/api/admin-analytics",
    adminAnalyticsRoutes
  );

  // ======================================
  // AUDIT
  // ======================================

  app.use(
    "/audit",
    auditRoutes
  );

  app.use(
    "/api/audit",
    auditRoutes
  );

};
