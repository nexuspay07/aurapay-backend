const SystemLearning = require("../models/SystemLearning");
const SystemConfig = require("../models/SystemConfig");

async function updateLearning(feedback) {
  let system = await SystemLearning.findOne();

  if (!system) {
    system = await SystemLearning.create({});
  }

  system.totalTransactions += 1;

  // 📊 Evaluate correctness
  if (feedback.wasFraud && feedback.decision === "APPROVE") {
    system.falseNegatives += 1;
  }

  if (!feedback.wasFraud && feedback.decision === "BLOCK") {
    system.falsePositives += 1;
  }

  // 🎯 Accuracy calculation
  const errors = system.falseNegatives + system.falsePositives;
  system.fraudAccuracy = 1 - errors / system.totalTransactions;

  // 🧠 Adjust sensitivity
  if (system.falseNegatives > system.falsePositives) {
    system.fraudSensitivity += 0.05; // more strict
  } else {
    system.fraudSensitivity -= 0.02; // more lenient
  }

  // Clamp values
  system.fraudSensitivity = Math.max(0.5, Math.min(2, system.fraudSensitivity));

  system.updatedAt = new Date();
  await system.save();

  // 🔥 APPLY TO SYSTEM CONFIG
  await adjustSystemConfig(system);

  return system;
}

async function adjustSystemConfig(system) {
  let config = await SystemConfig.findOne();

  if (!config) return;

  // Dynamically adjust thresholds
  config.fraudBlockThreshold = Math.round(70 * system.fraudSensitivity);
  config.fraudFlagThreshold = Math.round(40 * system.fraudSensitivity);

  await config.save();
}

module.exports = { updateLearning };