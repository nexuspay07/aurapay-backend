const express = require("express");
const router = express.Router();

const Transaction =
  require("../models/Transaction");

router.get(
  "/dashboard",
  async (req, res) => {
    try {
      const transactions =
        await Transaction.find({
          success: true,
        });

      const revenue =
        transactions.reduce(
          (sum, tx) =>
            sum + tx.amount,
          0
        );

      const successCount =
        transactions.length;

      const totalCount =
        await Transaction.countDocuments();

      const successRate =
        totalCount
          ? (
              (successCount /
                totalCount) *
              100
            ).toFixed(1)
          : 0;

      res.json({
        revenueToday:
          revenue,

        monthlyRevenue:
          revenue,

        transactions:
          totalCount,

        successRate,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

module.exports = router;