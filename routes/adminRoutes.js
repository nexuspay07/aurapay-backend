const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");

const permission = require("../middlewares/permission");
const permissions = require("../middlewares/permission");

const admin = require("../middlewares/admin");
const adminAuth = require("../middlewares/adminAuth");

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const LedgerEntry = require("../models/LedgerEntry");
const FraudLog = require("../models/FraudLog");
const AuditLog = require("../models/AuditLog");

const createAuditLog = require("../utils/createAuditLog");

// ======================================
// GLOBAL ADMIN PROTECTION
// ======================================

router.use(auth);
router.use(adminAuth);

// ======================================
// ADMIN HEALTH CHECK
// ======================================

router.get("/test", (req, res) => {
  res.json({
    message: "✅ Admin routes working",
    admin: req.user.email,
    role: req.user.role,
  });
});

// ======================================
// GET ALL USERS
// ======================================

router.get("/users", async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// ======================================
// GET ALL TRANSACTIONS
// ======================================

router.get("/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate(
        "user",
        "email role status frozen"
      )
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// ======================================
// GET LEDGER ENTRIES
// ======================================

router.get("/ledger", async (req, res) => {
  try {
    const entries = await LedgerEntry.find()
      .populate("user", "email")
      .populate("transaction")
      .sort({ createdAt: -1 });

    res.json(entries);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// ======================================
// GET FRAUD LOGS
// ======================================

router.get("/fraud-logs", async (req, res) => {
  try {
    const logs = await FraudLog.find()
      .populate("user", "email")
      .sort({ createdAt: -1 });

    res.json(logs);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// ======================================
// FREEZE USER
// ======================================

router.post(
  "/users/:id/freeze",
  permissions([
    "risk_admin",
    "super_admin",
  ]),
  async (req, res) => {
    try {
      const { reason, hours } = req.body;

      const freezeUntil = hours
        ? new Date(
            Date.now() +
              Number(hours) *
                60 *
                60 *
                1000
          )
        : null;

      const user =
        await User.findByIdAndUpdate(
          req.params.id,
          {
            frozen: true,
            freezeUntil,
            freezeReason:
              reason || "Admin freeze",
          },
          { new: true }
        ).select("-password");

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      await createAuditLog({
        admin: req.user._id,
        action: "freeze_user",
        targetUser: user._id,

        metadata: {
          reason,
          hours,
        },

        req,
      });

      res.json({
        message: "User frozen",
        user,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  }
);

// ======================================
// UNFREEZE USER
// ======================================

router.post(
  "/users/:id/unfreeze",
  permissions([
    "risk_admin",
    "super_admin",
  ]),
  async (req, res) => {
    try {
      const user =
        await User.findByIdAndUpdate(
          req.params.id,
          {
            frozen: false,
            freezeUntil: null,
            freezeReason: null,
          },
          { new: true }
        ).select("-password");

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      await createAuditLog({
        admin: req.user._id,
        action: "unfreeze_user",
        targetUser: user._id,
        req,
      });

      res.json({
        message: "User unfrozen",
        user,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  }
);

// ======================================
// AUDIT LOGS
// ======================================

router.get(
  "/audit-logs",
  permission("audit:view"),
  async (req, res) => {
    try {
      const logs = await AuditLog.find()
        .populate("admin", "email")
        .populate(
          "targetUser",
          "email"
        )
        .populate("transaction")
        .sort({ createdAt: -1 });

      res.json(logs);
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  }
);

// ======================================
// LIVE OPERATIONS METRICS
// ======================================

router.get(
  "/metrics",
  async (req, res) => {
    try {
      // USERS

      const totalUsers =
        await User.countDocuments();

      const frozenUsers =
        await User.countDocuments({
          frozen: true,
        });

      // TRANSACTIONS

      const totalTransactions =
        await Transaction.countDocuments();

      const completedTransactions =
        await Transaction.countDocuments(
          {
            status: "completed",
          }
        );

      const refundedTransactions =
        await Transaction.countDocuments(
          {
            refunded: true,
          }
        );

      // FRAUD

      const fraudAlerts =
        await FraudLog.countDocuments();

      // VOLUME

      const volumeAggregation =
        await Transaction.aggregate([
          {
            $match: {
              status:
                "completed",
            },
          },

          {
            $group: {
              _id: null,

              totalVolume: {
                $sum: "$amount",
              },
            },
          },
        ]);

      const totalVolume =
        volumeAggregation[0]
          ?.totalVolume || 0;

      // SUCCESS RATE

      const successRate =
        totalTransactions > 0
          ? (
              (completedTransactions /
                totalTransactions) *
              100
            ).toFixed(2)
          : 0;

      // RESPONSE

      res.json({
        totalUsers,

        frozenUsers,

        totalTransactions,

        completedTransactions,

        refundedTransactions,

        fraudAlerts,

        totalVolume,

        successRate,
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);



module.exports = router;