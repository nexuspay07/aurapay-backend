const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");

const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");



// ======================================
// JWT TOKEN
// ======================================

function createAccessToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      merchantId: user.merchantId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

// ======================================
// REGISTER
// ======================================

router.post(
  "/register",
  async (req, res) => {
    try {
      const {
        email,
        password,
        role,
        merchantId,
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error:
            "Email and password are required",
        });
      }

      const existingUser =
        await User.findOne({
          email:
            email.toLowerCase(),
        });

      if (existingUser) {
        return res.status(400).json({
          error:
            "User already exists",
        });
      }

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      // ===========================
      // EMAIL VERIFICATION TOKEN
      // ===========================

      const verificationToken =
        crypto.randomBytes(32).toString(
          "hex"
        );

        const hashedVerificationToken =
  crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");

      const verificationExpiry =
        new Date(
          Date.now() +
            24 *
              60 *
              60 *
              1000
        );

      const user =
        await User.create({
          email:
            email.toLowerCase(),

          password:
            hashedPassword,

          role:
            role || "user",

          merchantId:
            merchantId ||
            null,

          status:
            "unverified",

          emailVerified:
            false,

          emailVerificationToken:
  hashedVerificationToken,

          emailVerificationExpires:
            verificationExpiry,
        });

      // ===========================
      // SEND EMAIL
      // ===========================

      const emailResult =
await sendVerificationEmail(
user,
verificationToken
);

console.log(
"Verification email:",
emailResult
);

      res.status(201).json({
        message:
          "Registration successful. Please verify your email.",

        user: {
          id: user._id,
          email:
            user.email,
          emailVerified:
            false,
        },
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

// ======================================
// LOGIN
// ======================================

router.post(
  "/login",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      const user =
  await User.findOne({
    email: email.toLowerCase(),
  }).select("+password");

      if (!user) {
        return res.status(404).json({
          error:
            "User not found",
        });
      }

      

console.log("========== LOGIN DEBUG ==========");
console.log("req.body:", req.body);
console.log("Email:", email);
console.log("Password:", password);
console.log("User:", user);
console.log("user.password:", user?.password);
console.log("typeof password:", typeof password);
console.log("typeof user.password:", typeof user?.password);
console.log("================================");

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

  return res.status(401).json({
    error:
      "Invalid password",
  });
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

  user,
});
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error:
          err.message,
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
      const hashedToken =
  crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

      const user =
        await User.findOne({
          emailVerificationToken:
  hashedToken,
        });

      if (!user) {
        return res.status(400).json({
          error:
            "Invalid verification link.",
        });
      }

      if (
        !user.emailVerificationExpires ||
        user.emailVerificationExpires <
          new Date()
      ) {
        return res.status(400).json({
          error:
            "Verification link has expired.",
        });
      }

      user.emailVerified = true;

      user.status = "verified";

      user.emailVerificationToken =
        null;

      user.emailVerificationExpires =
        null;

      await user.save();

      res.json({
        success: true,

        message:
          "Email verified successfully.",
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

// ======================================
// RESEND VERIFICATION EMAIL
// ======================================

router.post(
  "/resend-verification",
  async (req, res) => {
    try {
      const { email } =
        req.body;

      const user =
        await User.findOne({
          email:
            email.toLowerCase(),
        });

        console.log("========== RESEND ==========");
console.log(user);

      if (!user) {
        return res.status(404).json({
          error:
            "User not found.",
        });
      }

      const adminRoles = [
  "super_admin",
  "finance_admin",
  "risk_admin",
  "support_admin",
  "auditor",
];

if (user.emailVerified) {
  return res.status(400).json({
    error: "Email is already verified.",
  });
}

      const verificationToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      const hashedVerificationToken =
crypto
.createHash("sha256")
.update(verificationToken)
.digest("hex");

user.emailVerificationToken =
hashedVerificationToken;

      user.emailVerificationExpires =
        new Date(
          Date.now() +
            24 *
              60 *
              60 *
              1000
        );

      await user.save();

      console.log(
  "Saved token:",
  user.emailVerificationToken
);

      const result =
  await sendVerificationEmail(
    user,
    verificationToken
  );

console.log(result);

      res.json({
        success: true,

        message:
          "Verification email sent successfully.",
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);


// ======================================
// FORGOT PASSWORD
// ======================================

router.post(
  "/forgot-password",
  async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: "Email is required.",
        });
      }

      const user =
        await User.findOne({
          email:
            email.toLowerCase(),
        });

      // Do not reveal whether the email exists
      if (!user) {
        return res.json({
          message:
            "If an account exists, a password reset email has been sent.",
        });
      }

      // ======================================
// ACCOUNT LOCK CHECK
// ======================================

if (
  user.lockedUntil &&
  user.lockedUntil > new Date()
) {
  return res.status(423).json({
    error:
      "Account temporarily locked. Please try again later.",
  });
}

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

      await sendPasswordResetEmail(
        user,
        resetToken
      );

      res.json({
        success: true,

        message:
          "If an account exists, a password reset email has been sent.",
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error:
          err.message,
      });
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
        });

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

      if (password.length < 8) {
  return res.status(400).json({
    error: "Password must be at least 8 characters long.",
  });
}

const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

if (!passwordRegex.test(password)) {
  return res.status(400).json({
    error:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number.",
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

      user.password =
        hashedPassword;

      // ======================================
      // CLEAR RESET TOKEN
      // ======================================

      user.passwordResetToken =
        null;

      user.passwordResetExpires =
        null;

      user.loginAttempts = 0;

      user.lockedUntil =
        null;

      await user.save();

      res.json({
        success: true,

        message:
          "Password reset successfully.",
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        error:
          err.message,
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
        });

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
      console.log(err);

      res.status(500).json({
        error: err.message,
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
      console.log(err);

      res.status(500).json({
        error: err.message,
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
      console.log(err);

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

// ======================================

module.exports = router;