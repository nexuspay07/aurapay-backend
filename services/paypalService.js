const axios = require("axios");

async function getPayPalToken() {
  try {
    const response = await axios({
      url: "https://api-m.sandbox.paypal.com/v1/oauth2/token",
      method: "post",
      auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: "grant_type=client_credentials",
    });
    return response.data.access_token;
  } catch (error) {
    return null;
  }
}

async function payWithPayPal(data) {
  try {
    const token = await getPayPalToken();
    if (!token) throw new Error("No PayPal token");

    const response = await axios({
      url: "https://api-m.sandbox.paypal.com/v2/checkout/orders",
      method: "post",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      data: { intent: "CAPTURE", purchase_units: [{ amount: { currency_code: data.currency.toUpperCase(), value: data.amount.toString() } }] },
    });
    return { success: true, provider: "PayPal", id: response.data.id, status: "CREATED" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { payWithPayPal };