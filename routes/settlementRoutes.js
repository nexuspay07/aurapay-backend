const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");
const createAuditLog = require("../utils/createAuditLog");
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
  permission("settlement:view"),
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
  permission("settlement:complete"),
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
  permission("settlement:complete"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return invalidId(res);
      }

      const settlement = await Settlement.findById(req.params.id);
      if (!settlement) return res.status(404).json({ success: false, error: { code: "SETTLEMENT_NOT_FOUND", message: "Settlement not found." } });
      if (settlement.environment !== "sandbox" || settlement.livemode !== false) return res.status(403).json({ success: false, error: { code: "SANDBOX_ONLY", message: "Only sandbox settlements can be completed." } });
      if (settlement.status === "completed") return res.status(409).json({ success: false, error: { code: "ALREADY_COMPLETED", message: "Settlement is already completed." } });
      const before = settlement.status; settlement.status = "completed"; settlement.settlementDate = new Date(); settlement.processedAt = settlement.settlementDate; await settlement.save();
      await createAuditLog({ admin: req.user._id, actorEmail: req.user.email, action: "sandbox_settlement_completed", targetType: "settlement", targetId: settlement._id, severity: "high", metadata: { before, after: "completed", simulationOnly: true }, req });
      res.json({ success: true, data: settlement, meta: { simulationOnly: true } });
    } catch (err) {
      res.status(500).json({
        error: "Failed to complete settlement",
      });
    }
  }
);

module.exports = router;
