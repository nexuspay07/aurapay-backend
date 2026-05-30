const express = require("express");

const router = express.Router();

const Settlement =
  require("../models/Settlement");

// ======================================
// GET SETTLEMENTS
// ======================================

router.get(
  "/",
  async (req, res) => {
    try {
      const settlements =
        await Settlement.find()
          .populate(
            "merchantId"
          )
          .sort({
            createdAt: -1,
          });

      res.json(
        settlements
      );
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
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
      const settlement =
        await Settlement.create(
          req.body
        );

      res.status(201).json(
        settlement
      );
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
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
      const settlement =
        await Settlement.findByIdAndUpdate(
          req.params.id,
          {
            status:
              "completed",

            settlementDate:
              new Date(),
          },
          {
            new: true,
          }
        );

      res.json(
        settlement
      );
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

module.exports = router;