const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const User = require("../models/User");
const BusinessProfile = require("../models/BusinessProfile");

// ✅ Submit onboarding
router.post("/", auth, async (req, res) => {
  try {
    const { businessName, ownerName, country } = req.body;

    if (!businessName || !ownerName || !country) {
      return res.status(400).json({
        error: "All onboarding fields are required",
      });
    }

    const existingProfile = await BusinessProfile.findOne({ user: req.user._id });

    if (existingProfile) {
      return res.status(400).json({
        error: "Business profile already exists",
      });
    }

    const profile = await BusinessProfile.create({
      user: req.user._id,
      businessName,
      ownerName,
      country,
    });

    await User.findByIdAndUpdate(req.user._id, {
      status: "pending",
      onboardingCompleted: true,
    });

    res.json({
      message: "Onboarding submitted successfully",
      profile,
      status: "pending",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get current onboarding/profile info
router.get("/", auth, async (req, res) => {
  try {
    const profile = await BusinessProfile.findOne({ user: req.user._id });
    const user = await User.findById(req.user._id).select("status onboardingCompleted");

    res.json({
      profile,
      status: user?.status || "unverified",
      onboardingCompleted: user?.onboardingCompleted || false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;