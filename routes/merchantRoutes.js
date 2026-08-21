const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");
const createAuditLog = require("../utils/createAuditLog");
const { setMerchantActive } =
  require("../services/merchantAccountStateService");
const Merchant = require("../models/Merchant");
const User =
  require("../models/User");

const { registerMerchant } = require("../services/merchantOnboardingService");
const { publicAuthRateLimit } = require("../middlewares/publicAuthRateLimit");

const router = express.Router();

function invalidId(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid ID.",
  });
}

// ======================================
// CREATE MERCHANT
// ======================================

router.post(
  "/register",
  publicAuthRateLimit("merchant-registration", { limit: 5, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    try {
      const result = await registerMerchant(req.body);
      return res.status(result.status).json(result.body);
    } catch (err) {
      return res.status(500).json({ success: false, error: { code: "REGISTRATION_FAILED", message: "We could not create the account. Please try again." } });
    }
  }
);

// ======================================
// GET ALL MERCHANTS
// ======================================

router.get("/", auth, adminAuth, permission("merchant:view"), async (req, res) => {
  try {
    const merchants =
      await Merchant.find().sort({
        createdAt: -1,
      });

    res.json(merchants);
  } catch (err) {
    res.status(500).json({
      error: "Failed to load merchants",
    });
  }
});

// ======================================
// GET SINGLE MERCHANT
// ======================================

router.get("/:id", auth, adminAuth, permission("merchant:view"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const merchant =
      await Merchant.findById(
        req.params.id
      );

    if (!merchant) {
      return res.status(404).json({
        error:
          "Merchant not found",
      });
    }

    res.json(merchant);
  } catch (err) {
    res.status(500).json({
      error:
        "Failed to load merchant",
    });
  }
});

// ======================================
// VERIFY MERCHANT
// ======================================

router.patch(
  "/:id/verify",
  auth,
  adminAuth,
  permission("merchant:verify"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const merchant = await Merchant.findById(req.params.id);
      if (!merchant) return res.status(404).json({ success: false, error: { code: "MERCHANT_NOT_FOUND", message: "Merchant not found." } });
      if (merchant.verificationStatus === "verified") return res.status(409).json({ success: false, error: { code: "ALREADY_VERIFIED", message: "Merchant is already verified." } });
      const before = merchant.verificationStatus; merchant.verificationStatus = "verified"; await merchant.save();
      await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "merchant_verified", targetType: "merchant", targetId: merchant._id, targetLabel: merchant.businessName, severity: "high", metadata: { before, after: "verified" }, req });
      res.json({ success: true, data: merchant });
    } catch (err) {
      res.status(500).json({
        error: "Failed to verify merchant",
      });
    }
  }
);

// ======================================
// REJECT MERCHANT
// ======================================

router.patch(
  "/:id/reject",
  auth,
  adminAuth,
  permission("merchant:verify"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const merchant = await Merchant.findById(req.params.id);
      if (!merchant) return res.status(404).json({ success: false, error: { code: "MERCHANT_NOT_FOUND", message: "Merchant not found." } });
      if (merchant.verificationStatus === "rejected") return res.status(409).json({ success: false, error: { code: "ALREADY_REJECTED", message: "Merchant is already rejected." } });
      const before = merchant.verificationStatus; merchant.verificationStatus = "rejected"; await merchant.save();
      await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "merchant_rejected", targetType: "merchant", targetId: merchant._id, targetLabel: merchant.businessName, severity: "high", metadata: { before, after: "rejected", reason: req.body?.reason || null }, req });
      res.json({ success: true, data: merchant });
    } catch (err) {
      res.status(500).json({
        error: "Failed to reject merchant",
      });
    }
  }
);

// ======================================
// UPDATE RISK LEVEL
// ======================================

router.patch(
  "/:id/risk",
  auth,
  adminAuth,
  permission("merchant:risk"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      if (!["low", "medium", "high"].includes(req.body?.riskLevel)) return res.status(400).json({ success: false, error: { code: "INVALID_RISK_LEVEL", message: "Invalid risk level." } });
      const merchant = await Merchant.findById(req.params.id);
      if (!merchant) return res.status(404).json({ success: false, error: { code: "MERCHANT_NOT_FOUND", message: "Merchant not found." } });
      const before = merchant.riskLevel; merchant.riskLevel = req.body.riskLevel; await merchant.save();
      await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "merchant_risk_changed", targetType: "merchant", targetId: merchant._id, targetLabel: merchant.businessName, severity: "high", metadata: { before, after: merchant.riskLevel }, req });
      res.json({ success: true, data: merchant });
    } catch (err) {
      res.status(500).json({
        error: "Failed to update merchant risk",
      });
    }
  }
);

async function changeMerchantAccess(req, res, active) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const { merchant, invalidatedUsers } = await setMerchantActive(
      req.params.id,
      active
    );
    const action = active ? "merchant.enabled" : "merchant.disabled";
    await createAuditLog({
      admin: req.user._id,
      actorEmail: req.user.email,
      action,
      targetType: "merchant",
      targetId: merchant._id,
      targetLabel: merchant.businessName,
      severity: "high",
      metadata: {
        before: { active: !active },
        after: { active },
        reason: req.body?.reason || null,
        sessionsInvalidated: true,
        invalidatedUsers,
      },
      req,
    });
    await createAuditLog({
      admin: req.user._id,
      actorEmail: req.user.email,
      action: "merchant.sessions.invalidated",
      targetType: "merchant",
      targetId: merchant._id,
      targetLabel: merchant.businessName,
      severity: "high",
      metadata: { reason: action, invalidatedUsers },
      req,
    });
    return res.json({ success: true, data: merchant });
  } catch (error) {
    if (error.code === "MERCHANT_NOT_FOUND") {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === "MERCHANT_STATE_UNCHANGED") {
      return res.status(409).json({ success: false, error: { code: error.code, message: error.message } });
    }
    return res.status(500).json({ success: false, error: { code: "MERCHANT_ACCESS_UPDATE_FAILED", message: "Failed to update merchant access." } });
  }
}

router.patch(
  "/:id/disable",
  auth,
  adminAuth,
  permission("merchant:verify"),
  (req, res) => changeMerchantAccess(req, res, false)
);

router.patch(
  "/:id/enable",
  auth,
  adminAuth,
  permission("merchant:verify"),
  (req, res) => changeMerchantAccess(req, res, true)
);

module.exports = router;
