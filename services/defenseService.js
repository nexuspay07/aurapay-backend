const User = require("../models/User");
const DeviceFingerprint = require("../models/DeviceFingerprint");

async function applyDefense(user, fraudResult) {
  let action = "NONE";
  let frozen = false;
  let freezeUntil = null;

  if (fraudResult.decision === "BLOCK") {
    freezeUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.findByIdAndUpdate(user._id, {
      frozen: true,
      freezeUntil,
      $inc: { fraudCount: 1 },
    });

    // optional: block known devices for this user
    try {
      await DeviceFingerprint.updateMany(
        { user: user._id },
        { $set: { isBlocked: true } }
      );
    } catch (err) {
      console.log("⚠️ Device block skipped:", err.message);
    }

    action = "ACCOUNT_FROZEN";
    frozen = true;
  } else if (fraudResult.decision === "FLAG") {
    action = "MONITOR";
  }

  return {
    action,
    frozen,
    freezeUntil,
  };
}

module.exports = { applyDefense };