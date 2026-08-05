const express = require("express");
const router = express.Router();

const merchantAuth =
  require("../middlewares/merchantAuth");

const Transaction = require("../models/Transaction");
const CheckoutSession = require("../models/CheckoutSession");
const Settlement = require("../models/Settlement");

// ======================================
// MERCHANT ANALYTICS DASHBOARD
// ======================================

router.get(
  "/dashboard",
  merchantAuth,
  async (req, res) => {
    try {

      // ======================================
      // GET MERCHANT ID
      // ======================================

      const merchantId =
  req.merchant._id;

      // ======================================
      // TRANSACTION STATS
      // ======================================

      const totalTransactions =
        await Transaction.countDocuments({
          merchant: merchantId,
        });

      const successfulPayments =
        await Transaction.countDocuments({
          merchant: merchantId,
          success: true,
        });

      const failedPayments =
        await Transaction.countDocuments({
          merchant: merchantId,
          success: false,
        });

      const revenueAggregation =
        await Transaction.aggregate([
          {
            $match: {
              merchant: merchantId,
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
        await CheckoutSession.countDocuments({
          merchant: merchantId,
        });

      const paidCheckouts =
        await CheckoutSession.countDocuments({
          merchant: merchantId,
          status: "paid",
        });

      const pendingCheckouts =
        await CheckoutSession.countDocuments({
          merchant: merchantId,
          status: "created",
        });

      const failedCheckouts =
        await CheckoutSession.countDocuments({
          merchant: merchantId,
          status: "failed",
        });

      // ======================================
      // SETTLEMENT STATS
      // ======================================

      const pendingSettlements =
        await Settlement.countDocuments({
          merchant: merchantId,
          status: "pending",
        });

      const completedSettlements =
        await Settlement.countDocuments({
          merchant: merchantId,
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
        await Transaction.find({
          merchant: merchantId,
        })
          .sort({
            createdAt: -1,
          })
          .limit(10);

      // ======================================
      // RECENT CHECKOUTS
      // ======================================

      const recentCheckouts =
        await CheckoutSession.find({
          merchant: merchantId,
        })
          .sort({
            createdAt: -1,
          })
          .limit(10);

      // ======================================
      // RECENT SETTLEMENTS
      // ======================================

      const recentSettlements =
        await Settlement.find({
          merchant: merchantId,
        })
          .sort({
            createdAt: -1,
          })
          .limit(10);

          // ======================================
// REVENUE HISTORY (LAST 7 DAYS)
// ======================================

const revenueHistory =
  await Transaction.aggregate([
    {
      $match: {
        merchant: merchantId,
        success: true,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%b %d",
            date: "$createdAt",
          },
        },
        revenue: {
          $sum: "$amount",
        },
      },
    },
    {
      $sort: {
        _id: 1,
      },
    },
  ]);

const formattedRevenueHistory =
  revenueHistory.map((item) => ({
    day: item._id,
    revenue: item.revenue,
  }));

      // ======================================
      // RESPONSE
      // ======================================

      res.json({
       revenueToday: totalRevenue,
monthlyRevenue: totalRevenue,
        totalRevenue,
        revenueHistory: formattedRevenueHistory,

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
        recentSettlements,
      });

    } catch (err) {

      res.status(500).json({
        error: "Failed to load merchant analytics",
      });

    }
  }
);

router.get(
  "/transactions",
  merchantAuth,
  async (req, res) => {
    try {
      const transactions =
        await Transaction.find({
          merchant: req.merchant._id,
        })
          .sort({
            createdAt: -1,
          })
          .limit(500);

      res.json(transactions);
    } catch (err) {
      res.status(500).json({
        error: "Failed to load merchant transactions",
      });
    }
  }
);

router.get(
  "/settlements",
  merchantAuth,
  async (req, res) => {
    try {
      const settlements =
        await Settlement.find({
          merchant: req.merchant._id,
        })
          .sort({
            createdAt: -1,
          })
          .limit(500);

      res.json(settlements);
    } catch (err) {
      res.status(500).json({
        error: "Failed to load merchant settlements",
      });
    }
  }
);

module.exports = router;
