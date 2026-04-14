const SystemConfig = require("../models/SystemConfig");

async function processTransactionFeedback(data) {
  try {
    const {
      success,
      fraud,
      fraudDecision,
      amount,
    } = data;

    let config = await SystemConfig.findOne();

    if (!config) {
      config = await SystemConfig.create({
        fraudBlockThreshold: 70,
        fraudFlagThreshold: 40,
        learningRate: 0.05,
      });
    }

    const update = {};

    // if a large transaction passed with APPROVE, become stricter
    if (fraud === false && fraudDecision === "APPROVE" && amount > 5000) {
      update.fraudBlockThreshold = Math.max(50, config.fraudBlockThreshold - 2);
    }

    // if something got blocked but wasn't fraud, become slightly looser
    if (fraud === false && fraudDecision === "BLOCK") {
      update.fraudBlockThreshold = Math.min(95, config.fraudBlockThreshold + 2);
    }

    // flagged but completed successfully → ease warning threshold slightly
    if (fraudDecision === "FLAG" && success === true) {
      update.fraudFlagThreshold = Math.min(80, config.fraudFlagThreshold + 1);
    }

    if (Object.keys(update).length > 0) {
      const updated = await SystemConfig.findByIdAndUpdate(
        config._id,
        { $set: update },
        { new: true }
      );

      console.log("🧠 System Learning Updated:", updated);
    } else {
      console.log("🧠 No learning adjustment needed");
    }

    console.log("📊 Feedback processed");
  } catch (err) {
    console.log("⚠️ Learning system failed:", err.message);
  }
}

module.exports = { processTransactionFeedback };