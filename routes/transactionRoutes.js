const express =
  require("express");

const router =
  express.Router();

const Transaction =
  require("../models/Transaction");
const auth = require("../middlewares/auth");
const adminAuth = require("../middlewares/adminAuth");
const permission = require("../middlewares/permission");

router.get(
  "/",
  auth,
  adminAuth,
  permission("transaction:view"),
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
