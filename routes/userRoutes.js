const express = require("express");
const router = express.Router();

const User = require("../models/User");
const auth = require("../middlewares/auth");

// 👤 current user profile
router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.json(user);
});

// 💰 balance
router.get("/balance", auth, async (req, res) => {
  const user = await User.findById(req.user._id).select("balance");
  res.json(user.balance);
});

// 🛡️ risk status
router.get("/risk-status", auth, async (req, res) => {
  const user = await User.findById(req.user._id).select("fraudCount frozen freezeUntil");
  res.json({
    fraudCount: user.fraudCount || 0,
    frozen: user.frozen || false,
    freezeUntil: user.freezeUntil || null,
  });
});

module.exports = router;