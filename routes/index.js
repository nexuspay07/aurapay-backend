module.exports = function registerRoutes(app) {

  // ======================================
  // ROUTE IMPORTS
  // ======================================

  const stripeWebhookRoutes =
    require("./stripeWebhookRoutes");

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

  const paymentRoutes =
    require("./paymentRoutes");

  const paymentCompletionRoutes =
    require("./paymentCompletionRoutes");

  const paypalCheckoutRoutes =
    require("./paypalCheckoutRoutes");

  const stripeRoutes =
    require("./stripeRoutes");

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

  const auditRoutes =
    require("./auditRoutes");

  // ======================================
  // STRIPE WEBHOOK
  // ======================================

  app.use(
    "/stripe",
    stripeWebhookRoutes
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
  // PAYMENTS
  // ======================================

  app.use(
    "/payments",
    paymentRoutes
  );

  app.use(
    "/api/payments",
    paymentRoutes
  );

  app.use(
    "/payment-completion",
    paymentCompletionRoutes
  );

  app.use(
    "/api/payment-completion",
    paymentCompletionRoutes
  );

  app.use(
    "/paypal-checkout",
    paypalCheckoutRoutes
  );

  app.use(
    "/api/paypal-checkout",
    paypalCheckoutRoutes
  );

  app.use(
    "/stripe",
    stripeRoutes
  );

  app.use(
    "/api/stripe",
    stripeRoutes
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