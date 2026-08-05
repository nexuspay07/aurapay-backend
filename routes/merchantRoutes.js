const express = require("express");
const mongoose = require("mongoose");
const bcrypt =
  require("bcryptjs");
const crypto = require("crypto");

const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const Merchant = require("../models/Merchant");
const User =
  require("../models/User");

const {
  sendVerificationEmail,
} = require("../services/emailService");

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
  async (req, res) => {
    try {
      const {
        businessName,
        legalName,
        businessType,
        contactEmail,
        country,
        ownerEmail,
        password,
      } = req.body;

      const existingUser =
        await User.findOne({
          email: ownerEmail,
        });

      if (existingUser) {
        return res.status(400).json({
          error:
            "Owner account already exists",
        });
      }

      const existingMerchant =
        await Merchant.findOne({
          contactEmail,
        });

      if (existingMerchant) {
        return res.status(400).json({
          error:
            "Merchant already exists",
        });
      }

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      const merchant =
        await Merchant.create({
          businessName,
          legalName,
          businessType,
          contactEmail,
          country,
          ownerEmail,
        });

      const verificationToken =
        crypto.randomBytes(32).toString("hex");

      const hashedVerificationToken =
        crypto
          .createHash("sha256")
          .update(verificationToken)
          .digest("hex");

      const owner =
        await User.create({
          email: ownerEmail,
          password: hashedPassword,
          role: "merchant_owner",
          merchantId: merchant._id,
          status: "unverified",
          emailVerified: false,
          emailVerificationToken:
            hashedVerificationToken,
          emailVerificationExpires:
            new Date(
              Date.now() +
              24 * 60 * 60 * 1000
            ),
        });

      await sendVerificationEmail(
        owner,
        verificationToken
      );

      res.status(201).json({
        success: true,
        message:
          "Merchant created. Please check your email to verify your account.",
        merchant,
      });
    } catch (err) {
      res.status(500).json({
        error:
          "Merchant registration failed",
      });
    }
  }
);

// ======================================
// GET ALL MERCHANTS
// ======================================

router.get("/", async (req, res) => {
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

router.get("/:id", async (req, res) => {
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
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const merchant =
        await Merchant.findByIdAndUpdate(
          req.params.id,
          {
            verificationStatus:
              "verified",
          },
          {
            new: true,
          }
        );

      res.json(merchant);
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
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const merchant =
        await Merchant.findByIdAndUpdate(
          req.params.id,
          {
            verificationStatus:
              "rejected",
          },
          {
            new: true,
          }
        );

      res.json(merchant);
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
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const merchant =
        await Merchant.findByIdAndUpdate(
          req.params.id,
          {
            riskLevel:
              req.body.riskLevel,
          },
          {
            new: true,
          }
        );

      res.json(merchant);
    } catch (err) {
      res.status(500).json({
        error: "Failed to update merchant risk",
      });
    }
  }
);

module.exports = router;
