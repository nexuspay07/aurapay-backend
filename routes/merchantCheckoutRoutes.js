const express = require("express");

const router = express.Router();

const Checkout =
  require("../models/Checkout");

// CREATE CHECKOUT

router.post(
  "/",
  async (req, res) => {
    try {
      const checkout =
        await Checkout.create({
          ...req.body,

          slug:
            Math.random()
              .toString(36)
              .substring(2, 10),
        });

      res.status(201).json(
        checkout
      );
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

// GET ALL

router.get(
  "/",
  async (req, res) => {
    const checkouts =
      await Checkout.find();

    res.json(checkouts);
  }
);

module.exports = router;