const express = require("express");

const router = express.Router();

router.get(
  "/dashboard",
  (req, res) => {
    res.json({
      success: true,
      route: "merchant analytics working",
    });
  }
);

module.exports = router;