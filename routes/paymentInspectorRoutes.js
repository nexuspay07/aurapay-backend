const express = require("express");
const merchantAuth = require("../middlewares/merchantAuth");
const paymentInspectorService = require("../services/paymentInspectorService");

const router = express.Router();

router.get("/:paymentId", merchantAuth, async (req, res) => {
  try {
    const inspection = await paymentInspectorService.inspect(req.merchant._id, req.params.paymentId);
    if (!inspection) return res.status(404).json({ success: false, error: "Payment not found." });
    return res.json({ success: true, data: inspection });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to inspect payment." });
  }
});

module.exports = router;
