const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ======================================
// ADMIN LOGIN
// ======================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        error: "Admin not found",
      });
    }

    const allowedRoles = [
      "super_admin",
      "finance_admin",
      "risk_admin",
      "support_admin",
      "auditor",
    ];

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: "Not an admin account",
      });
    }

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {
      return res.status(401).json({
        error: "Invalid password",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      token,
      admin: {
        id: user._id,
        email: user.email,
        role: user.role,
        permissions:
          user.permissions || [],
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// TEMP CREATE ADMIN
router.get("/seed-admin", async (req, res) => {
  try {
    const hashed = await bcrypt.hash(
      "admin123",
      10
    );

    const user = await User.create({
      email: "admin@example.com",
      password: hashed,
      role: "super_admin",
      status: "verified",
    });

    res.json(user);
  } catch (err) {
    res.json({
      error: err.message,
    });
  }
});

module.exports = router;