const express = require("express");
const router = express.Router();

const User = require("../models/User");
const auth = require("../middlewares/auth");

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("email balance status role frozen freezeUntil onboardingCompleted");

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/balance", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("balance");
    res.json(user.balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/risk-status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("frozen freezeUntil");
    res.json({
      frozen: user?.frozen || false,
      freezeUntil: user?.freezeUntil || null,
      fraudCount: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;