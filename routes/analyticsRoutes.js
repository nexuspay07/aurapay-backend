const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const admin = require("../middlewares/admin");

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const FraudLog = require("../models/FraudLog");

router.get("/overview", auth, admin, async (req, res) => {
  try {
    const users = await User.countDocuments();

    const transactions = await Transaction.find();

    const fraudCount = await FraudLog.countDocuments();

    const completedTransactions = transactions.filter(
      (tx) => tx.status === "completed"
    );

    const refundedTransactions = transactions.filter(
      (tx) => tx.status === "refunded"
    );

    const totalVolume = completedTransactions.reduce(
      (sum, tx) => sum + Number(tx.amount || 0),
      0
    );

    const refundVolume = refundedTransactions.reduce(
      (sum, tx) => sum + Number(tx.amount || 0),
      0
    );

    const successRate =
      transactions.length > 0
        ? (
            (completedTransactions.length /
              transactions.length) *
            100
          ).toFixed(2)
        : 0;

    res.json({
      totalUsers: users,
      totalTransactions: transactions.length,
      completedTransactions:
        completedTransactions.length,
      refundedTransactions:
        refundedTransactions.length,
      fraudAlerts: fraudCount,
      totalVolume,
      refundVolume,
      successRate,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;