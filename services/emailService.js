const { Resend } = require("resend");

const resend = new Resend(
  process.env.RESEND_API_KEY
);

// ======================================
// GENERIC EMAIL
// ======================================

async function sendEmail({
  to,
  subject,
  html,
}) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
}

// ======================================
// EMAIL VERIFICATION
// ======================================

async function sendVerificationEmail(
  user,
  token
) {
  const verificationLink =
`${process.env.FRONTEND_URL}/verify-email/${token}`;

  return sendEmail({
    to: user.email,

    subject:
      "Verify your AuraPay account",

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">

        <h2>Welcome to AuraPay 👋</h2>

        <p>
          Thank you for creating your AuraPay account.
        </p>

        <p>
          Please verify your email address by clicking the button below.
        </p>

        <p style="margin:30px 0">
          <a
            href="${verificationLink}"
            style="
              background:#2563EB;
              color:white;
              padding:14px 24px;
              text-decoration:none;
              border-radius:8px;
              display:inline-block;
            "
          >
            Verify Email
          </a>
        </p>

        <p>
          This verification link will expire in 24 hours.
        </p>

        <hr>

        <small>
          If you didn't create an AuraPay account,
          you can safely ignore this email.
        </small>

      </div>
    `,
  });
}

// ======================================
// PASSWORD RESET
// ======================================

async function sendPasswordResetEmail(
  user,
  token
) {
  const resetLink =
`${process.env.FRONTEND_URL}/reset-password/${token}`;

  return sendEmail({
    to: user.email,

    subject:
      "Reset your AuraPay password",

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">

        <h2>Password Reset</h2>

        <p>
          Someone requested a password reset for your AuraPay account.
        </p>

        <p style="margin:30px 0">
          <a
            href="${resetLink}"
            style="
              background:#111827;
              color:white;
              padding:14px 24px;
              text-decoration:none;
              border-radius:8px;
              display:inline-block;
            "
          >
            Reset Password
          </a>
        </p>

        <p>
          This link expires in one hour.
        </p>

        <hr>

        <small>
          If you didn't request this reset,
          you can safely ignore this email.
        </small>

      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};