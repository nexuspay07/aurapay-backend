const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../models/User");
const Merchant = require("../models/Merchant");
const { ADMIN_ROLES } = require("../config/adminPermissions");
const createAuditLog = require("../utils/createAuditLog");
const {
  canMerchantAuthenticate,
  isMerchantRole,
} = require("../services/merchantSessionSecurity");
const { createAccessToken } =
  require("../services/merchantAccessTokenService");

const {
  sendPasswordResetEmail,
} = require("../services/emailService");
const { normalizeEmail, validateEmail, PASSWORD_RE } = require("../services/publicAccountInput");
const { resendVerification, verifyEmail } = require("../services/merchantOnboardingService");
const { publicAuthRateLimit } = require("../middlewares/publicAuthRateLimit");

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    merchantId: user.merchantId,
    status: user.status,
    emailVerified: user.emailVerified,
    onboardingCompleted: user.onboardingCompleted,
  };
}



// ======================================
// JWT TOKEN
// ======================================

// ======================================
// REGISTER
// ======================================

router.post(
  "/register",
  async (req, res) => {
    return res.status(410).json({ success: false, error: { code: "MERCHANT_REGISTRATION_MOVED", message: "Use the merchant registration endpoint." } });
  }
);

// ======================================
// LOGIN
// ======================================

router.post(
  "/login",
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;

      if (!email || !password) {
        return res.status(400).json({
          error:
            "Email and password are required",
        });
      }

      const user =
  await User.findOne({
    email,
  }).select("+password +merchantSecurityVersion");

      if (!user || ADMIN_ROLES.includes(user.role)) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const match =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!match) {

  user.loginAttempts += 1;

  if (user.loginAttempts >= 5) {

    user.lockedUntil =
      new Date(
        Date.now() +
          15 *
            60 *
            1000
      );

    user.loginAttempts = 0;
  }

  await user.save();

  return res.status(401).json({ error: "Invalid email or password." });
}

      if (isMerchantRole(user.role)) {
        const merchant = user.merchantId
          ? await Merchant.findById(user.merchantId)
          : null;
        if (!canMerchantAuthenticate(user, merchant)) {
          return res.status(401).json({ error: "Invalid email or password." });
        }
      } else if (user.frozen === true || user.status !== "verified") {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      // ==================================
      // EMAIL NOT VERIFIED
      // ==================================

      if (
        !user.emailVerified
      ) {
        return res.status(403).json({
          error:
            "Please verify your email before logging in.",
        });
      }

      user.lastLogin =
        new Date();

        user.loginAttempts = 0;

user.lockedUntil = null;

      await user.save();

      const token =
  createAccessToken(user);

const refreshToken =
  crypto
    .randomBytes(64)
    .toString("hex");

user.refreshToken =
  refreshToken;

  user.refreshTokenExpires =
  new Date(
    Date.now() +
      30 *
        24 *
        60 *
        60 *
        1000
  );

  

await user.save();

res.json({
  token,

  refreshToken,

  user: publicUser(user),
});
    } catch (err) {
      res.status(500).json({
        error:
          "Login failed",
      });
    }
  }
);

// ======================================
// VERIFY EMAIL
// ======================================

router.get(
  "/verify-email/:token",
  async (req, res) => {
    try {
      const result = await verifyEmail(req.params.token);
      return res.status(result.status).json(result.body);
    } catch (err) {
      return res.status(500).json({ success: false, error: { code: "VERIFICATION_FAILED", message: "We could not verify this email." } });
    }
  }
);

// ======================================
// RESEND VERIFICATION EMAIL
// ======================================

router.post(
  "/resend-verification",
  publicAuthRateLimit("verification-resend", { limit: 5, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    try {
      const result = await resendVerification(req.body?.email);
      return res.status(result.status).json(result.body);
    } catch (err) {
      return res.status(200).json({ success: true, message: "If an eligible account exists, verification instructions will be sent." });
    }
  }
);


// ======================================
// FORGOT PASSWORD
// ======================================

router.post(
  "/forgot-password",
  publicAuthRateLimit("forgot-password", { limit: 5, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const generic = { success: true, message: "If an account exists, password reset instructions will be sent." };
      if (!validateEmail(email)) return res.json(generic);

      const user =
        await User.findOne({
          email,
          role: { $in: ["merchant_owner", "merchant_staff"] },
        });

      // Do not reveal whether the email exists
      if (!user) {
        return res.json(generic);
      }

      // ======================================
// ACCOUNT LOCK CHECK
// ======================================

if (user.lockedUntil && user.lockedUntil > new Date()) return res.json(generic);

      // ======================================
      // GENERATE RESET TOKEN
      // ======================================

     
 const resetToken =
  crypto
    .randomBytes(32)
    .toString("hex");

const hashedResetToken =
  crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

      user.passwordResetToken =
  hashedResetToken;

      user.passwordResetExpires =
        new Date(
          Date.now() +
            60 *
              60 *
              1000
        ); // 1 hour

      await user.save();

      // ======================================
      // SEND EMAIL
      // ======================================

      let delivered = true;
      try { await sendPasswordResetEmail(user, resetToken); } catch { delivered = false; }
      if (!delivered && process.env.NODE_ENV !== "production" && process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS === "true") {
        generic.developmentResetLink = require("../services/emailService").buildPublicLink(`/reset-password/${resetToken}`);
      }
      return res.json(generic);
    } catch (err) {
      return res.json({ success: true, message: "If an account exists, password reset instructions will be sent." });
    }
  }
);

// ======================================
// RESET PASSWORD
// ======================================

router.post(
  "/reset-password/:token",
  async (req, res) => {
    try {
      const hashedToken =
  crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

      const {
        password,
      } = req.body;

      if (!password) {
        return res.status(400).json({
          error:
            "New password is required.",
        });
      }

      const user =
        await User.findOne({
          passwordResetToken:
  hashedToken,
        }).select("+passwordResetToken +merchantSecurityVersion");

      if (!user) {
        return res.status(400).json({
          error:
            "Invalid reset link.",
        });
      }

      if (
        !user.passwordResetExpires ||
        user.passwordResetExpires <
          new Date()
      ) {
        return res.status(400).json({
          error:
            "Reset link has expired.",
        });
      }

if (!PASSWORD_RE.test(password)) {
  return res.status(400).json({
    error:
      "Password must be 10-128 characters and include uppercase, lowercase, and a number.",
  });
}

      // ======================================
      // HASH NEW PASSWORD
      // ======================================

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      const update = {
        $set: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
          refreshToken: null,
          refreshTokenExpires: null,
          loginAttempts: 0,
          lockedUntil: null,
        },
      };
      if (isMerchantRole(user.role)) {
        update.$inc = { merchantSecurityVersion: 1 };
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id, passwordResetToken: hashedToken },
        update,
        { new: true }
      ).select("+merchantSecurityVersion");
      if (!updatedUser) {
        return res.status(400).json({ error: "Invalid reset link." });
      }

      if (isMerchantRole(updatedUser.role)) {
        await createAuditLog({
          admin: updatedUser._id,
          actorEmail: updatedUser.email,
          action: "merchant.password.reset.completed",
          targetType: "merchant_session",
          targetId: updatedUser._id,
          targetLabel: updatedUser.email,
          severity: "high",
          metadata: {
            sessionsInvalidated: true,
            securityVersion: updatedUser.merchantSecurityVersion,
          },
          req,
        });
      }

      res.json({
        success: true,

        message:
          "Password reset successfully.",
      });
    } catch (err) {
      res.status(500).json({
        error:
          "Password reset failed",
      });
    }
  }
);

// ======================================
// REFRESH ACCESS TOKEN
// ======================================

router.post(
  "/refresh-token",
  async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({
          error: "Refresh token required.",
        });
      }

      const user =
        await User.findOne({
          refreshToken,
        }).select("+refreshToken +merchantSecurityVersion");

      if (!user) {
        return res.status(401).json({
          error: "Invalid refresh token.",
        });
      }

      const accessToken =
        createAccessToken(user);

      res.json({
        token: accessToken,
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to refresh token",
      });
    }
  }
);

// ======================================
// LOGOUT
// ======================================

router.post(
  "/logout",
  async (req, res) => {
    try {
      const { refreshToken } =
        req.body;

      if (!refreshToken) {
        return res.json({
          success: true,
        });
      }

      const user =
        await User.findOne({
          refreshToken,
        });

      if (user) {
        user.refreshToken = null;

        await user.save();
      }

      res.json({
        success: true,
        message:
          "Logged out successfully.",
      });
    } catch (err) {
      res.status(500).json({
        error: "Logout failed",
      });
    }
  }
);

// ======================================
// LOGOUT ALL SESSIONS
// ======================================

router.post(
  "/logout-all",
  async (req, res) => {
    try {
      const {
        userId,
      } = req.body;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID.",
        });
      }

      if (
        !isMerchantRole(user.role) ||
        !user.refreshTokenExpires ||
        user.refreshTokenExpires <= new Date()
      ) {
        return res.status(401).json({ error: "Invalid refresh token." });
      }

      const merchant = user.merchantId
        ? await Merchant.findById(user.merchantId)
        : null;
      if (!canMerchantAuthenticate(user, merchant)) {
        return res.status(401).json({ error: "Invalid refresh token." });
      }

      const user =
        await User.findById(
          userId
        );

      if (!user) {
        return res.status(404).json({
          error:
            "User not found.",
        });
      }

      user.refreshToken =
        null;

      await user.save();

      res.json({
        success: true,
        message:
          "All sessions logged out.",
      });
    } catch (err) {
      res.status(500).json({
        error:
          "Failed to log out sessions",
      });
    }
  }
);

// ======================================

module.exports = router;
