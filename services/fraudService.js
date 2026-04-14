const Transaction = require("../models/Transaction");
const UserRiskProfile = require("../models/UserRiskProfile");
const SystemConfig = require("../models/SystemConfig");

const { getFraudScore } = require("./aiFraudService");

// 🧠 (PHASE 22 READY) Device service optional safe import
let getDevice;
try {
  getDevice = require("./deviceService").getDevice;
} catch (e) {
  getDevice = null;
}

// 🛡️ MAIN FRAUD DETECTION ENGINE
async function detectFraud(user, data) {
  let riskScore = 0;
  let reasons = [];

  const { amount, currency, req } = data;

  // =========================================================
  // 🔹 LOAD USER PROFILE
  // =========================================================
  const profile = await UserRiskProfile.findOne({ user: user._id });

  // =========================================================
  // 🔹 LOAD SYSTEM CONFIG (SAFE DEFAULTS)
  // =========================================================
  const config = await SystemConfig.findOne();

  const BLOCK_THRESHOLD = config?.fraudBlockThreshold ?? 70;
  const FLAG_THRESHOLD = config?.fraudFlagThreshold ?? 40;

  // =========================================================
  // 🔥 RULE 1 — HARD AMOUNT KILL SWITCH
  // =========================================================
  if (amount >= 10000) {
    return {
      riskScore: 100,
      decision: "BLOCK",
      reasons: ["Extreme amount — auto blocked"],
      aiScore: 0,
    };
  }

  if (amount >= 5000) {
    riskScore += 70;
    reasons.push("Very high transaction amount");
  } else if (amount >= 1000) {
    riskScore += 40;
    reasons.push("High transaction amount");
  }

  // =========================================================
  // 🧠 RULE 2 — ADAPTIVE USER BEHAVIOR
  // =========================================================
  if (profile?.avgAmount > 0) {
    if (amount > profile.avgAmount * 3) {
      riskScore += 30;
      reasons.push("Amount unusually high vs user pattern");
    }
  } else if (amount > 500) {
    riskScore += 20;
    reasons.push("High amount (no profile yet)");
  }

  // =========================================================
  // 🧠 RULE 3 — VELOCITY CHECK
  // =========================================================
  const recentTx = await Transaction.find({
    user: user._id,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });

  if (recentTx.length >= 3) {
    riskScore += 40;
    reasons.push("Too many transactions in short time");
  }

  // =========================================================
  // 🧠 RULE 4 — CURRENCY ANOMALY
  // =========================================================
  if (profile?.preferredCurrency && currency !== profile.preferredCurrency) {
    riskScore += 15;
    reasons.push("Unusual currency usage");
  }

  // =========================================================
  // 🧠 RULE 5 — FRAUD HISTORY
  // =========================================================
  if (profile?.fraudCount >= 2) {
    riskScore += 30;
    reasons.push("User has fraud history");
  }

  // =========================================================
  // 🧠 RULE 6 — DEVICE INTELLIGENCE (PHASE 22 READY)
  // =========================================================
  let deviceInfo = null;

  if (getDevice && req) {
    try {
      const result = await getDevice(req, user._id);
      deviceInfo = result.device;

      if (result.isNew) {
        riskScore += 25;
        reasons.push("New device detected");
      }

      if (deviceInfo.trustScore < 40) {
        riskScore += 20;
        reasons.push("Low trust device");
      }

      if (deviceInfo.isBlocked) {
        riskScore += 100;
        reasons.push("Blocked device");
      }
    } catch (err) {
      console.log("⚠️ Device check failed:", err.message);
    }
  }

  // =========================================================
  // 🤖 AI FRAUD MODEL (SAFE EXECUTION)
  // =========================================================
  let aiScore = 0;

  try {
    aiScore = await getFraudScore({
      amount,
      velocity: recentTx.length || 1,
      is_currency_anomaly:
        profile?.preferredCurrency
          ? currency !== profile.preferredCurrency
            ? 1
            : 0
          : 0,
      fraud_history: profile?.fraudCount || 0,
    });

    console.log("🤖 AI Fraud Score:", aiScore);

    if (aiScore > 0.7) {
      riskScore += 50;
      reasons.push("AI detected high fraud probability");
    } else if (aiScore > 0.4) {
      riskScore += 25;
      reasons.push("AI detected medium fraud risk");
    }
  } catch (err) {
    console.log("⚠️ AI Fraud Engine failed, using rules only");
  }

  // =========================================================
  // 🎯 FINAL DECISION ENGINE
  // =========================================================
  let decision = "APPROVE";

  if (riskScore >= BLOCK_THRESHOLD) {
    decision = "BLOCK";
  } else if (riskScore >= FLAG_THRESHOLD) {
    decision = "FLAG";
  }

  return {
    riskScore,
    decision,
    reasons,
    aiScore,
    deviceInfo,
  };
}

module.exports = { detectFraud };