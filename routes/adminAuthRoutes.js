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
    const { email, password } =
      req.body;

    console.log(
      "ADMIN LOGIN:",
      email
    );

    const user =
      await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        error: "Admin not found",
      });
    }

    // Allowed admin roles
    const allowedRoles = [
      "super_admin",
      "finance_admin",
      "risk_admin",
      "support_admin",
      "auditor",
    ];

    // Verify role
    if (
      !allowedRoles.includes(
        user.role
      )
    ) {
      return res.status(403).json({
        error:
          "Not an admin account",
      });
    }

    // Compare password
    const match =
      await bcrypt.compare(
        password,
        user.password
      );

    console.log(
      "PASSWORD MATCH:",
      match
    );

    if (!match) {
      return res.status(401).json({
        error: "Invalid password",
      });
    }

    // Generate token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        permissions:
          user.permissions || [],
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Success response
    res.json({
      token,

      admin: {
        id: user._id,
        email: user.email,
        role: user.role,

        permissions:
          user.permissions || [],

        status: user.status,
      },
    });
  } catch (err) {
    console.log(
      "ADMIN LOGIN ERROR:"
    );

    console.log(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;