const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("../models/User");

async function createAdmin() {
  try {
    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log("✅ Mongo Connected");

    const hashedPassword =
      await bcrypt.hash(
        "Admin123!",
        10
      );

    const existing =
      await User.findOne({
        email: "admin@example.com",
      });

    if (existing) {
      console.log(
        "⚠️ Admin already exists"
      );

      process.exit();
    }

    const admin = await User.create({
      email: "admin@example.com",

      password: hashedPassword,

      role: "super_admin",

      permissions: [
        "user:view",
        "wallet:view",
        "transaction:view",
        "fraud:view",
        "audit:view",
        "analytics:view",
      ],

      status: "verified",

      onboardingCompleted: true,

      frozen: false,

      balance: {
        USD: 10000,
        EUR: 9000,
      },
    });

    console.log(
      "✅ Admin Created"
    );

    console.log(admin);

    process.exit();
  } catch (err) {
    console.log(err);

    process.exit();
  }
}

createAdmin();