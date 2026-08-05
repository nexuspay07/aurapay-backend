const express = require("express");

const router = express.Router();

const merchantAuth =
  require("../middlewares/merchantAuth");

const merchantProfileController =
  require("../controllers/merchantProfileController");

// ======================================
// GET PROFILE
// ======================================

router.get(
  "/",
  merchantAuth,
  merchantProfileController.getProfile
);

// ======================================
// UPDATE PROFILE
// ======================================

router.put(
  "/",
  merchantAuth,
  merchantProfileController.updateProfile
);

module.exports = router;