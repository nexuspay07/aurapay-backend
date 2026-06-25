const express = require("express");
const router = express.Router();

const Transaction =
  require("../models/Transaction");

const Merchant =
  require("../models/Merchant");

const CheckoutSession =
  require("../models/CheckoutSession");

router.get(
  "/dashboard",
  async (req, res) => {
    try {
      const totalRevenue =
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

      const totalTransactions =
        await Transaction.countDocuments();

      const totalMerchants =
        await Merchant.countDocuments();

      const totalCheckouts =
        await CheckoutSession.countDocuments();

      const recentTransactions =
        await Transaction.find()
          .sort({
            createdAt: -1,
          })
          .limit(10);

      res.json({
        revenue:
          totalRevenue[0]?.total || 0,

        transactions:
          totalTransactions,

        merchants:
          totalMerchants,

        checkouts:
          totalCheckouts,

        recentTransactions,
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