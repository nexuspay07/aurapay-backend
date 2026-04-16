const express = require("express");
const router = express.Router();

const User = require("../models/User"); // ✅ MUST EXIST
const auth = require("../middlewares/auth");

// 💰 Get balance
router.get("/balance", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("balance");
    res.json(user.balance);
  } catch (err) {
    console.log("❌ BALANCE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// 💰 TEST TOP-UP
router.post("/topup", auth, async (req, res) => {
  try {
    console.log("🔥 TOPUP HIT");
    console.log("User:", req.user);
    console.log("Body:", req.body);

    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Unauthorized user" });
    }

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
        $inc: {
          [`balance.${String(currency).toLowerCase()}`]: Number(amount),
        },
      },
      { new: true }
    ).select("balance");

    console.log("✅ TOPUP SUCCESS:", updatedUser);

    res.json({
      message: "Account topped up",
      balance: updatedUser.balance,
    });

  } catch (err) {
    console.log("🔥 TOPUP ERROR:", err); // 👈 CRITICAL LOG
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;