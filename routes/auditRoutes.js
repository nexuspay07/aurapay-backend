const express = require("express");

const router = express.Router();

const AuditLog = require(
  "../models/AuditLog"
);
const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");

// ======================================
// GET AUDIT LOGS
// ======================================

router.get(
  "/logs",
  auth,
  adminAuth,
  permission("audit:view"),
  async (req, res) => {
    try {
      const logs =
        await AuditLog.find()
          .populate(
            "admin",
            "email role"
          )
          .sort({
            createdAt: -1,
          })
          .limit(200);

      res.json(logs);
    } catch (err) {
      res.status(500).json({
        error: "Failed to load audit logs",
      });
    }
  }
);

module.exports = router;
