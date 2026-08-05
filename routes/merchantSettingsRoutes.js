const express = require("express");

const router = express.Router();

const merchantAuth =
  require("../middlewares/merchantAuth");

const merchantSettingsController =
  require("../controllers/merchantSettingsController");

// ======================================
// GET SETTINGS
// ======================================

router.get(
  "/",
  merchantAuth,
  merchantSettingsController.getSettings
);

// ======================================
// UPDATE SETTINGS
// ======================================

router.put(
  "/",
  merchantAuth,
  merchantSettingsController.updateSettings
);

module.exports = router;