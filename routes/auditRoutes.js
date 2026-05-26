const express = require("express");

const router = express.Router();

const AuditLog = require(
  "../models/AuditLog"
);

// ======================================
// GET AUDIT LOGS
// ======================================

router.get(
  "/logs",
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
      console.log(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;