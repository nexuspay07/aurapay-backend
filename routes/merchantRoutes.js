const express = require("express");

const router = express.Router();

const Merchant = require("../models/Merchant");

const bcrypt =
  require("bcryptjs");

const User =
  require("../models/User");

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

      const owner =
        await User.create({
          email: ownerEmail,

          password:
            hashedPassword,

          role:
            "merchant_owner",

          merchantId:
            merchant._id,

          status:
            "verified",
        });

      res.status(201).json({
        merchant,
        owner,
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error:
          err.message,
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
    console.log(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// ======================================
// GET SINGLE MERCHANT
// ======================================

router.get("/:id", async (req, res) => {
  try {
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
    console.log(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// ======================================
// VERIFY MERCHANT
// ======================================

router.patch(
  "/:id/verify",
  async (req, res) => {
    try {
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
      console.log(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

// ======================================
// REJECT MERCHANT
// ======================================

router.patch(
  "/:id/reject",
  async (req, res) => {
    try {
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
      console.log(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

// ======================================
// UPDATE RISK LEVEL
// ======================================

router.patch(
  "/:id/risk",
  async (req, res) => {
    try {
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
      console.log(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;