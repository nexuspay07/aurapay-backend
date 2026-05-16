const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const admin = require("../middlewares/admin");
const adminAuth = require("../middlewares/adminAuth");

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const LedgerEntry = require("../models/LedgerEntry");
const FraudLog = require("../models/FraudLog");
const createAuditLog = require("../utils/createAuditLog");
const AuditLog = require("../models/AuditLog");
const permissions = require("../middlewares/permissions");

// All admin routes require login + admin role
router.use(auth);
router.use(adminAuth);

// Admin health check
router.get("/test", (req, res) => {
  res.json({
    message: "✅ Admin routes working",
    admin: req.user.email,
    role: req.user.role,
  });
});

// Get all users
router.get("/users", async (req, res) => {
  const users = await User.find()
    .select("-password")
    .sort({ createdAt: -1 });

  res.json(users);
});

// Get all transactions
router.get("/transactions", async (req, res) => {
  const transactions = await Transaction.find()
    .populate("user", "email role status frozen")
    .sort({ createdAt: -1 });

  res.json(transactions);
});

// Get all ledger entries
router.get("/ledger", async (req, res) => {
  const entries = await LedgerEntry.find()
    .populate("user", "email")
    .populate("transaction")
    .sort({ createdAt: -1 });

  res.json(entries);
});

// Get all fraud logs
router.get("/fraud-logs", async (req, res) => {
  const logs = await FraudLog.find()
    .populate("user", "email")
    .sort({ createdAt: -1 });

  res.json(logs);
});

// Freeze user
router.post(
  "/users/:id/freeze",
  auth,
  permissions(["risk_admin", "super_admin"]), async (req, res) => {
  const { reason, hours } = req.body;

  const freezeUntil = hours
    ? new Date(Date.now() + Number(hours) * 60 * 60 * 1000)
    : null;

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    {
      frozen: true,
      freezeUntil,
      freezeReason: reason || "Admin freeze",
    },
    { new: true }
  ).select("-password");

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

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    message: "User frozen",
    user,
  });
});

// Unfreeze user
router.post(
  "/users/:id/unfreeze",
  auth,
  permissions(["risk_admin", "super_admin"]), async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    {
      frozen: false,
      freezeUntil: null,
      freezeReason: null,
    },
    { new: true }
  ).select("-password");

  await createAuditLog({
  admin: req.user._id,
  action: "unfreeze_user",
  targetUser: user._id,
  req,
});

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    message: "User unfrozen",
    user,
  });
});

router.get(
  "/audit-logs",
  auth,
  permissions(["auditor", "super_admin"]), auth, admin, async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate("admin", "email")
      .populate("targetUser", "email")
      .populate("transaction")
      .sort({ createdAt: -1 })
      .limit(200);

    res.json(logs);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;