const express = require("express");
const router = express.Router();

const Transaction =
  require("../models/Transaction");

const Merchant =
  require("../models/Merchant");

const CheckoutSession =
  require("../models/CheckoutSession");

const Settlement =
  require("../models/Settlement");

const User =
  require("../models/User");

router.get(
  "/dashboard",
  async (req, res) => {
    try {
      // =====================================
      // USERS
      // =====================================

      const totalUsers =
        await User.countDocuments();

      const frozenUsers =
        await User.countDocuments({
          frozen: true,
        });

      // =====================================
      // MERCHANTS
      // =====================================

      const totalMerchants =
        await Merchant.countDocuments();

      // =====================================
      // TRANSACTIONS
      // =====================================

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

      const completedTransactions =
        await Transaction.countDocuments({
          status: "completed",
        });

      const refundedTransactions =
        await Transaction.countDocuments({
          refunded: true,
        });

      const revenue =
        await Transaction.aggregate([
          {
            $match: {
              success: true,
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: "$amount",
              },
            },
          },
        ]);

      const totalRevenue =
        revenue[0]?.total || 0;

      const successRate =
        totalTransactions
          ? (
              (successfulPayments /
                totalTransactions) *
              100
            ).toFixed(1)
          : 0;

      // =====================================
      // CHECKOUTS
      // =====================================

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

      // =====================================
      // SETTLEMENTS
      // =====================================

      const pendingSettlements =
        await Settlement.countDocuments({
          status: "pending",
        });

      const completedSettlements =
        await Settlement.countDocuments({
          status: "completed",
        });

      // =====================================
      // RECENT ACTIVITY
      // =====================================

      const recentTransactions =
        await Transaction.find()
          .sort({
            createdAt: -1,
          })
          .limit(10);

      const recentCheckouts =
        await CheckoutSession.find()
          .sort({
            createdAt: -1,
          })
          .limit(10);

      const recentSettlements =
        await Settlement.find()
          .sort({
            createdAt: -1,
          })
          .limit(10);

      // =====================================
      // RESPONSE
      // =====================================

      res.json({
        totalUsers,
        frozenUsers,

        totalMerchants,

        totalRevenue,

        totalTransactions,
        successfulPayments,
        failedPayments,
        completedTransactions,
        refundedTransactions,

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
      console.error(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;