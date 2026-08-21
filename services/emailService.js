const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

function publicBaseUrl() {
  const value = String(process.env.AURAPAY_FRONTEND_URL || process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("A public frontend URL is required for email links.");
  return "http://localhost:5173";
}

function buildPublicLink(path) { return `${publicBaseUrl()}${path}`; }

// ======================================
// GENERIC EMAIL
// ======================================

async function sendEmail({ to, subject, html }) {
  if (process.env.EMAIL_DELIVERY_DISABLED === "true" || process.env.ADMIN_EMAIL_DELIVERY_DISABLED === "true") throw new Error("Email delivery disabled");
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

async function sendVerificationEmail(user, token) {
  const verificationLink =
    buildPublicLink(`/verify-email/${token}`);

  return sendEmail({
    to: user.email,

    subject: "Verify your AuraPay Sandbox Beta account",

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">

        <h2>Welcome to AuraPay Sandbox Beta</h2>

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

async function sendPasswordResetEmail(user, token) {
  const resetLink =
    buildPublicLink(`/reset-password/${token}`);

  return sendEmail({
    to: user.email,

    subject: "Reset your AuraPay Sandbox Beta password",

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">

        <h2>AuraPay Sandbox Beta Password Reset</h2>

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

async function sendAdminInvitationEmail(invitation, token) {
  const link = buildPublicLink(`/admin-invitation/${token}`);
  return sendEmail({ to: invitation.email, subject: "Your AuraPay Admin invitation", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>AuraPay Admin invitation</h2><p>You have been invited to the AuraPay Sandbox administration workspace as <strong>${invitation.role}</strong>.</p><p><a href="${link}" style="background:#2457d6;color:white;padding:14px 24px;text-decoration:none;border-radius:8px;display:inline-block">Activate admin access</a></p><p>This single-use invitation expires in 24 hours.</p><small>If you did not expect this invitation, you can ignore it.</small></div>` });
}

async function sendAdminPasswordResetEmail(user, token) {
  const link = buildPublicLink(`/admin-reset-password/${token}`);
  return sendEmail({ to: user.email, subject: "Reset your AuraPay Admin password", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Reset AuraPay Admin password</h2><p><a href="${link}" style="background:#111827;color:white;padding:14px 24px;text-decoration:none;border-radius:8px;display:inline-block">Reset admin password</a></p><p>This single-use link expires in one hour.</p><small>If you did not request this reset, you can ignore it.</small></div>` });
}

module.exports = {
  buildPublicLink,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAdminInvitationEmail,
  sendAdminPasswordResetEmail,
};
