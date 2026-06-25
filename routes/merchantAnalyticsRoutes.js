const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const CheckoutSession = require("../models/CheckoutSession");
const Settlement = require("../models/Settlement");

// ======================================
// MERCHANT ANALYTICS DASHBOARD
// ======================================

router.get("/dashboard", async (req, res) => {
  try {
    // ======================================
    // TRANSACTION STATS
    // ======================================

    const totalTransactions =
      await Transaction.countDocuments();

    const successfulPayments =
      await Transaction.countDocuments({
        success: true,
      });

    const failedPayments =
      await Transaction.countDocuments({
        success: false,
      });

    const revenueAggregation =
      await Transaction.aggregate([
        {
          $match: {
            success: true,
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: "$amount",
            },
          },
        },
      ]);

    const totalRevenue =
      revenueAggregation[0]?.totalRevenue || 0;

    // ======================================
    // CHECKOUT STATS
    // ======================================

    const totalCheckouts =
      await CheckoutSession.countDocuments();

    const paidCheckouts =
      await CheckoutSession.countDocuments({
        status: "paid",
      });

    const pendingCheckouts =
      await CheckoutSession.countDocuments({
        status: "created",
      });

    const failedCheckouts =
      await CheckoutSession.countDocuments({
        status: "failed",
      });

    // ======================================
    // SETTLEMENT STATS
    // ======================================

    const pendingSettlements =
      await Settlement.countDocuments({
        status: "pending",
      });

    const completedSettlements =
      await Settlement.countDocuments({
        status: "completed",
      });

    // ======================================
    // SUCCESS RATE
    // ======================================

    const successRate =
      totalTransactions > 0
        ? (
            (successfulPayments /
              totalTransactions) *
            100
          ).toFixed(1)
        : 0;

    // ======================================
    // RECENT TRANSACTIONS
    // ======================================

    const recentTransactions =
      await Transaction.find()
        .sort({
          createdAt: -1,
        })
        .limit(10);

    // ======================================
    // RECENT CHECKOUTS
    // ======================================

    const recentCheckouts =
      await CheckoutSession.find()
        .sort({
          createdAt: -1,
        })
        .limit(10);

    // ======================================
    // RESPONSE
    // ======================================

    res.json({
      revenueToday: totalRevenue,

      monthlyRevenue: totalRevenue,

      totalRevenue,

      totalTransactions,

      successfulPayments,

      failedPayments,

      successRate,

      totalCheckouts,

      paidCheckouts,

      pendingCheckouts,

      failedCheckouts,

      pendingSettlements,

      completedSettlements,

      recentTransactions,

      recentCheckouts,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;