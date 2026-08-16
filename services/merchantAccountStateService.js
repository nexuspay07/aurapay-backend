const mongoose = require("mongoose");

const Merchant = require("../models/Merchant");
const User = require("../models/User");
const { MERCHANT_ROLES } = require("./merchantSessionSecurity");

async function setMerchantActive(merchantId, active) {
  const session = await mongoose.startSession();
  let merchant;
  let invalidatedUsers = 0;

  try {
    await session.withTransaction(async () => {
      merchant = await Merchant.findById(merchantId).session(session);
      if (!merchant) {
        const error = new Error("Merchant not found.");
        error.code = "MERCHANT_NOT_FOUND";
        throw error;
      }
      if (merchant.active === active) {
        const error = new Error(`Merchant is already ${active ? "enabled" : "disabled"}.`);
        error.code = "MERCHANT_STATE_UNCHANGED";
        throw error;
      }

      merchant.active = active;
      await merchant.save({ session });

      const result = await User.updateMany(
        { merchantId: merchant._id, role: { $in: MERCHANT_ROLES } },
        {
          $inc: { merchantSecurityVersion: 1 },
          $set: { refreshToken: null, refreshTokenExpires: null },
        },
        { session }
      );
      invalidatedUsers = result.modifiedCount || 0;
    });
  } finally {
    await session.endSession();
  }

  return { merchant, invalidatedUsers };
}

module.exports = { setMerchantActive };
