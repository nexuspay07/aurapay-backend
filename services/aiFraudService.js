const axios = require("axios");

async function getFraudScore(data) {
  try {
    const res = await fetch("http://127.0.0.1:8000/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const json = await res.json();
    return json.fraud_probability || 0;

  } catch (err) {
    console.log("⚠️ AI Fraud Engine failed, using rules only");
    return 0; // fallback safely
  }
}

module.exports = { getFraudScore };