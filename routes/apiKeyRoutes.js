const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");
const apiKeyService =
  require("../services/apiKeyService");

const router = express.Router();

router.use(auth);
router.use(adminAuth);
router.use(permission("apikey:manage"));

function invalidId(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid ID.",
  });
}

// ======================================
// CREATE API KEY
// ======================================

router.post("/", async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Request body is missing.",
      });
    }

    const {
      merchant,
      name,
      environment,
      permissions,
      expiresAt,
    } = req.body;

    if (!merchant) {
      return res.status(400).json({
        success: false,
        message: "Merchant is required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(merchant)) {
      return invalidId(res);
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "API Key name is required.",
      });
    }

    const result =
      await apiKeyService.createApiKey({
        merchant,
        name,
        environment,
        permissions,
        expiresAt,
      });

    return res.status(201).json({
      success: true,
      message: "API key created.",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create API key.",
    });
  }
});

// ======================================
// GET MERCHANT KEYS
// ======================================

router.get("/:merchantId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.merchantId)) {
      return invalidId(res);
    }

    const keys =
      await apiKeyService.listMerchantKeys(
        req.params.merchantId
      );

    return res.status(200).json({
      success: true,
      data: keys,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load API keys.",
    });
  }
});

// ======================================
// ROTATE API KEY
// ======================================

router.post("/:id/rotate", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const result =
      await apiKeyService.rotateKey(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      message: "API key rotated.",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to rotate API key.",
    });
  }
});

// ======================================
// REVOKE API KEY
// ======================================

router.post("/:id/revoke", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const key =
      await apiKeyService.revokeKey(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      message: "API key revoked.",
      data: key,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to revoke API key.",
    });
  }
});

module.exports = router;
