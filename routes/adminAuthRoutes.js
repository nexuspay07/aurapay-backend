const express = require("express");

const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ======================================
// AVAILABLE PERMISSIONS
// ======================================

const ALL_PERMISSIONS = [
  "user:view",
  "user:freeze",

  "transaction:view",
  "transaction:refund",

  "fraud:view",

  "audit:view",

  "analytics:view",

  "admin:create",
  "admin:update",
];

// ======================================
// ROLE DEFAULT PERMISSIONS
// ======================================

const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,

  finance_admin: [
    "transaction:view",
    "transaction:refund",
    "analytics:view",
  ],

  risk_admin: [
    "fraud:view",
    "user:freeze",
    "transaction:view",
  ],

  support_admin: [
    "user:view",
    "transaction:view",
  ],

  auditor: [
    "audit:view",
    "analytics:view",
  ],
};

// ======================================
// ADMIN LOGIN
// ======================================

router.post(
  "/login",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      console.log(
        "ADMIN LOGIN:",
        email
      );

      const user =
        await User.findOne({
          email,
        });

      if (!user) {
        return res
          .status(404)
          .json({
            error:
              "Admin not found",
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
        return res
          .status(403)
          .json({
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
        return res
          .status(401)
          .json({
            error:
              "Invalid password",
          });
      }

      // Generate token

      const token = jwt.sign(
        {
          id: user._id,
          email: user.email,
          role: user.role,

          permissions:
            user.permissions ||
            [],
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
            user.permissions ||
            [],

          status:
            user.status,
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
  }
);

// ======================================
// CREATE ADMIN
// ======================================

router.post(
  "/create-admin",
  async (req, res) => {
    try {
      const {
        email,
        password,
        role,
      } = req.body;

      // Validate role

      const allowedRoles = [
        "super_admin",
        "finance_admin",
        "risk_admin",
        "support_admin",
        "auditor",
      ];

      if (
        !allowedRoles.includes(
          role
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              "Invalid role",
          });
      }

      // Check existing admin

      const existingUser =
        await User.findOne({
          email,
        });

      if (existingUser) {
        return res
          .status(400)
          .json({
            error:
              "User already exists",
          });
      }

      // Hash password

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      // Assign permissions

      const permissions =
        ROLE_PERMISSIONS[
          role
        ] || [];

      // Create admin

      const admin =
        await User.create({
          email,
          password:
            hashedPassword,

          role,

          permissions,

          status:
            "verified",
        });

      res.json({
        message:
          "Admin created successfully",

        admin: {
          id: admin._id,
          email:
            admin.email,
          role: admin.role,
          permissions:
            admin.permissions,
        },
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

// ======================================
// GET ALL ADMINS
// ======================================

router.get(
  "/admins",
  async (req, res) => {
    try {
      const admins =
        await User.find({
          role: {
            $in: [
              "super_admin",
              "finance_admin",
              "risk_admin",
              "support_admin",
              "auditor",
            ],
          },
        })
          .select("-password")
          .sort({
            createdAt: -1,
          });

      res.json(admins);
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;