const express = require("express");
const router = express.Router();

const User = require("../models/User");
const auth = require("../middlewares/auth");

// 💰 Get wallet balance
router.get("/balance", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("balance");
    res.json(user.balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 💰 TEST TOP-UP
router.post("/topup", auth, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!["usd", "eur"].includes(String(currency).toLowerCase())) {
      return res.status(400).json({ error: "Invalid currency" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $inc: { [`balance.${String(currency).toLowerCase()}`]: Number(amount) },
      },
      { new: true }
    ).select("balance");

    res.json({
      message: "Account topped up",
      balance: updatedUser.balance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;