const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const Settlement =
  require("../models/Settlement");

const router = express.Router();

router.use(auth);
router.use(adminAuth);

function invalidId(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid ID.",
  });
}

// ======================================
// GET SETTLEMENTS
// ======================================

router.get(
  "/",
  async (req, res) => {
    try {
      const settlements =
        await Settlement.find()
          .populate("merchant")
          .sort({
            createdAt: -1,
          });

      res.json(settlements);
    } catch (err) {
      res.status(500).json({
        error: "Failed to load settlements",
      });
    }
  }
);

// ======================================
// CREATE SETTLEMENT
// ======================================

router.post(
  "/",
  async (req, res) => {
    try {
      if (
        req.body.merchant &&
        !mongoose.Types.ObjectId.isValid(req.body.merchant)
      ) {
        return invalidId(res);
      }

      if (
        req.body.transaction &&
        !mongoose.Types.ObjectId.isValid(req.body.transaction)
      ) {
        return invalidId(res);
      }

      const settlement =
        await Settlement.create(req.body);

      res.status(201).json(settlement);
    } catch (err) {
      res.status(500).json({
        error: "Failed to create settlement",
      });
    }
  }
);

// ======================================
// COMPLETE SETTLEMENT
// ======================================

router.patch(
  "/:id/complete",
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const settlement =
        await Settlement.findByIdAndUpdate(
          req.params.id,
          {
            status: "completed",
            settlementDate: new Date(),
          },
          {
            new: true,
          }
        );

      res.json(settlement);
    } catch (err) {
      res.status(500).json({
        error: "Failed to complete settlement",
      });
    }
  }
);

module.exports = router;
