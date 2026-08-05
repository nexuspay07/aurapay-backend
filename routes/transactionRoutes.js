const express =
  require("express");

const router =
  express.Router();

const Transaction =
  require("../models/Transaction");
const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");

router.get(
  "/",
  auth,
  adminAuth,
  async (req, res) => {
    try {
      const transactions =
        await Transaction.find()
          .sort({
            createdAt: -1,
          });

      res.json(
        transactions
      );
    } catch (err) {
      res.status(500).json({
        error:
          "Failed to load transactions",
      });
    }
  }
);

module.exports = router;
