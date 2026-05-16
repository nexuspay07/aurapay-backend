require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB connected");

    const email = "freshuser999@example.com";

    const user = await User.findOne({ email });

    if (!user) {
      console.log("❌ User not found");
      process.exit();
    }

    user.role = "super_admin";

    user.permissions = [
      "transaction:view",
      "transaction:refund",
      "user:freeze",
      "fraud:view",
      "audit:view",
      "analytics:view",
    ];

    await user.save();

    console.log("✅ Admin permissions updated");
    console.log(user);

    process.exit();
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

seedAdmin();