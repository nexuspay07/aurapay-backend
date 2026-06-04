const express =
  require("express");

const router =
  express.Router();

const Transaction =
  require("../models/Transaction");

router.get(
  "/",
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
          err.message,
      });
    }
  }
);

module.exports = router;