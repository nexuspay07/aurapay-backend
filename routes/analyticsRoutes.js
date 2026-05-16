const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const FraudLog = require("../models/FraudLog");

// =========================
// ANALYTICS OVERVIEW
// =========================
router.get(
  "/overview",
  auth,
  adminAuth,
  permission("analytics:view"),
  async (req, res) => {
    try {
      const totalUsers = await User.countDocuments();

      const totalTransactions =
        await Transaction.countDocuments();

      const completedTransactions =
        await Transaction.countDocuments({
          status: "completed",
        });

      const refundedTransactions =
        await Transaction.countDocuments({
          status: "refunded",
        });

      const fraudAlerts =
        await FraudLog.countDocuments();

      const completedList =
        await Transaction.find({
          status: "completed",
        });

      const refundedList =
        await Transaction.find({
          status: "refunded",
        });

      const totalVolume =
        completedList.reduce(
          (sum, tx) =>
            sum + Number(tx.amount || 0),
          0
        );

      const refundVolume =
        refundedList.reduce(
          (sum, tx) =>
            sum + Number(tx.amount || 0),
          0
        );

      const successRate =
        totalTransactions > 0
          ? (
              (completedTransactions /
                totalTransactions) *
              100
            ).toFixed(2)
          : 0;

      res.json({
        totalUsers,
        totalTransactions,
        completedTransactions,
        refundedTransactions,
        fraudAlerts,
        successRate,
        totalVolume,
        refundVolume,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;