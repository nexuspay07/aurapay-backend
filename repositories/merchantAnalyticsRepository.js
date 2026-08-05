const Transaction = require("../models/Transaction");
const Checkout = require("../models/Checkout");
const Settlement = require("../models/Settlement");

class MerchantAnalyticsRepository {

  async getDashboard(merchantId) {

    // ===============================
    // TRANSACTIONS
    // ===============================

    const transactions =
      await Transaction.find({
        merchant: merchantId,
      }).sort({
        createdAt: -1,
      });

    const totalTransactions =
      transactions.length;

    const successfulPayments =
      transactions.filter(
        (t) => t.success === true
      ).length;

    const failedPayments =
      transactions.filter(
        (t) => t.success === false
      ).length;

    const totalRevenue =
      transactions
        .filter((t) => t.success)
        .reduce(
          (sum, t) => sum + t.amount,
          0
        );

    const successRate =
      totalTransactions === 0
        ? 0
        : Math.round(
            (successfulPayments /
              totalTransactions) *
              100
          );

    // ===============================
    // TODAY REVENUE
    // ===============================

    const today = new Date();

    today.setHours(
      0,
      0,
      0,
      0
    );

    const revenueToday =
      transactions
        .filter(
          (t) =>
            t.success &&
            t.createdAt >= today
        )
        .reduce(
          (sum, t) => sum + t.amount,
          0
        );

    // ===============================
    // MONTHLY REVENUE
    // ===============================

    const month =
      new Date();

    month.setDate(1);

    month.setHours(
      0,
      0,
      0,
      0
    );

    const monthlyRevenue =
      transactions
        .filter(
          (t) =>
            t.success &&
            t.createdAt >= month
        )
        .reduce(
          (sum, t) => sum + t.amount,
          0
        );

    // ===============================
    // CHECKOUTS
    // ===============================

    const checkouts =
      await Checkout.find({
        merchantId: merchantId,
      })
        .sort({
          createdAt: -1,
        })
        .limit(10);

    const totalCheckouts =
      await Checkout.countDocuments({
        merchantId: merchantId,
      });

    const paidCheckouts =
      await Checkout.countDocuments({
        merchantId: merchantId,
        status: "paid",
      });

    const pendingCheckouts =
      await Checkout.countDocuments({
        merchantId: merchantId,
        status: "pending",
      });

    const failedCheckouts =
      await Checkout.countDocuments({
        merchantId: merchantId,
        status: "failed",
      });

    // ===============================
    // SETTLEMENTS
    // ===============================

    const settlements =
      await Settlement.find({
        merchant: merchantId,
      })
        .sort({
          createdAt: -1,
        })
        .limit(10);

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

    return {

      revenueToday,

      monthlyRevenue,

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

      revenueHistory: [],

      recentTransactions:
        transactions.slice(0, 10),

      recentCheckouts:
        checkouts,

      recentSettlements:
        settlements,

    };

  }

}

module.exports =
  new MerchantAnalyticsRepository();