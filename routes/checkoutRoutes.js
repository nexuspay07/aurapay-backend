const express = require("express");

const router = express.Router();

const merchantAuth = require("../middlewares/merchantAuth");

const checkoutController =
  require("../controllers/checkout");

// ======================================
// CHECKOUT MANAGEMENT
// ======================================

// Create Checkout
router.post(
  "/",
  merchantAuth,
  checkoutController.createCheckout
);

// Merchant Dashboard
router.get(
  "/merchant",
  merchantAuth,
  checkoutController.listMerchantCheckouts
);

// Public Checkout
router.get(
  "/:slug",
  checkoutController.getCheckout
);

// Update Checkout
router.put(
  "/:id",
  merchantAuth,
  checkoutController.updateCheckout
);

// Delete Checkout
router.delete(
  "/:id",
  merchantAuth,
  checkoutController.deleteCheckout
);

// Publish Checkout
router.patch(
  "/:id/publish",
  merchantAuth,
  checkoutController.publishCheckout
);

// Archive Checkout
router.patch(
  "/:id/archive",
  merchantAuth,
  checkoutController.archiveCheckout
);

module.exports = router;
