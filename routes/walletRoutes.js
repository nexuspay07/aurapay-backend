const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");

// 💰 GET BALANCE
router.get("/balance", auth, async (req, res) => {
  console.log("👤 FULL USER:", req.user);

  res.json({
    usd: req.user.balance?.usd,
    eur: req.user.balance?.eur,
  });
});

// ➕ DEPOSIT (MULTI-CURRENCY)
router.post("/deposit", auth, async (req, res) => {
  const { amount, currency } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  if (!currency || !req.user.balance[currency]) {
    return res.status(400).json({ error: "Invalid currency" });
  }

  req.user.balance[currency] += amount;
  await req.user.save();

  res.json({
    message: "Deposit successful",
    balance: req.user.balance,
  });
});

module.exports = router;