const express = require("express");
const router = express.Router();

const User = require("../models/User");
const auth = require("../middlewares/auth");

router.get("/balance", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("balance");
    res.json(user.balance);
  } catch (err) {
    res.status(500).json({
      error: "Failed to load wallet balance",
    });
  }
});

router.post("/topup", auth, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: "Unauthorized user",
      });
    }

    const { amount, currency } = req.body;
    const normalizedCurrency = String(currency).toLowerCase();

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
      });
    }

    if (!["usd", "eur"].includes(normalizedCurrency)) {
      return res.status(400).json({
        error: "Invalid currency",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $inc: {
          [`balance.${normalizedCurrency}`]: Number(amount),
        },
      },
      { new: true }
    ).select("balance");

    res.json({
      message: "Account topped up",
      balance: updatedUser.balance,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to top up wallet",
    });
  }
});

module.exports = router;
