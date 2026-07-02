const express = require("express");

const router = express.Router();

const auth = require("../middlewares/auth");

const checkoutController =
  require("../controllers/checkout");

// ======================================
// CHECKOUT MANAGEMENT
// ======================================

// Create Checkout
router.post(
  "/",
  auth,
  checkoutController.createCheckout
);

// Merchant Dashboard
router.get(
  "/merchant",
  auth,
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
  auth,
  checkoutController.updateCheckout
);

// Delete Checkout
router.delete(
  "/:id",
  auth,
  checkoutController.deleteCheckout
);

// Publish Checkout
router.patch(
  "/:id/publish",
  auth,
  checkoutController.publishCheckout
);

// Archive Checkout
router.patch(
  "/:id/archive",
  auth,
  checkoutController.archiveCheckout
);

module.exports = router;