const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const Transaction = require("../models/Transaction");
const axios = require("axios");

// ======================================
// PAYPAL ACCESS TOKEN
// ======================================
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;

  const authString = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const response = await axios.post(
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
}

// ======================================
// CREATE PAYPAL ORDER
// ======================================
router.post("/create-order", auth, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const accessToken = await getPayPalAccessToken();

    const response = await axios.post(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: String(currency || "USD").toUpperCase(),
              value: Number(amount).toFixed(2),
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      id: response.data.id,
    });
  } catch (err) {
    console.error("❌ PAYPAL CREATE ORDER ERROR:", err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data || err.message || "Failed to create PayPal order",
    });
  }
});

// ======================================
// CAPTURE PAYPAL ORDER
// ======================================
router.post("/capture-order", auth, async (req, res) => {
  try {
    const { orderID, amount, currency } = req.body;

    if (!orderID) {
      return res.status(400).json({ error: "orderID is required" });
    }

    const accessToken = await getPayPalAccessToken();

    const response = await axios.post(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const captureId =
      response.data?.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderID;

    const status =
      response.data?.status || "COMPLETED";

    const transaction = await Transaction.create({
      user: req.user._id,
      amount: Number(amount),
      currency: String(currency || "usd").toLowerCase(),
      provider: "PayPal",
      transactionId: captureId,
      status,
      latency: 0,
      attempts: 1,
      errorMessage: null,
      success: true,
      paymentType: "paypal",
    });

    res.json({
      message: "PayPal payment captured and saved",
      transaction,
      paypal: response.data,
    });
  } catch (err) {
    console.error("❌ PAYPAL CAPTURE ERROR:", err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data || err.message || "Failed to capture PayPal order",
    });
  }
});

module.exports = router;