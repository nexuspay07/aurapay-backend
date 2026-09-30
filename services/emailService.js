const { Resend } = require("resend");

class EmailConfigurationError extends Error {
  constructor(code) {
    super("Authentication email configuration is invalid.");
    this.name = "EmailConfigurationError";
    this.code = code;
  }
}

class EmailDeliveryError extends Error {
  constructor(code) {
    super("Authentication email delivery failed.");
    this.name = "EmailDeliveryError";
    this.code = code;
  }
}

function normalizePublicBaseUrl(env = process.env) {
  const raw = String(env.AURAPAY_FRONTEND_URL || env.FRONTEND_URL || "").trim();
  if (!raw) {
    if (env.NODE_ENV === "production") throw new EmailConfigurationError("missing_frontend_url");
    return "http://localhost:5173";
  }
  let url;
  try { url = new URL(raw); } catch { throw new EmailConfigurationError("invalid_frontend_url"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new EmailConfigurationError("invalid_frontend_url");
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new EmailConfigurationError("insecure_frontend_url");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function validateDeliveryConfig(env = process.env) {
  if (!String(env.RESEND_API_KEY || "").trim()) throw new EmailConfigurationError("missing_api_key");
  const from = String(env.EMAIL_FROM || "").trim();
  const plainAddress = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  const namedAddress = /^[^<>\r\n]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/;
  if (!plainAddress.test(from) && !namedAddress.test(from)) {
    throw new EmailConfigurationError("invalid_email_from");
  }
  return Object.freeze({
    apiKey: String(env.RESEND_API_KEY).trim(),
    from,
    publicBaseUrl: normalizePublicBaseUrl(env),
  });
}

function shouldExposeDevelopmentLinks(env = process.env) {
  return env.NODE_ENV !== "production" && env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS === "true";
}

function createEmailService({ env = process.env, clientFactory = (apiKey) => new Resend(apiKey), logger = console } = {}) {
  let client;

  function buildPublicLink(path) {
    const safePath = String(path || "");
    if (!safePath.startsWith("/") || safePath.startsWith("//")) {
      throw new EmailConfigurationError("invalid_email_link_path");
    }
    return `${normalizePublicBaseUrl(env)}${safePath}`;
  }

  async function sendEmail({ to, subject, html, purpose = "authentication" }) {
    if (env.EMAIL_DELIVERY_DISABLED === "true" || env.ADMIN_EMAIL_DELIVERY_DISABLED === "true") {
      logger.info?.("auth_email_delivery", { purpose, success: false, reason: "delivery_disabled" });
      throw new EmailDeliveryError("delivery_disabled");
    }
    try {
      const config = validateDeliveryConfig(env);
      client ||= clientFactory(config.apiKey);
      const result = await client.emails.send({ from: config.from, to, subject, html });
      if (!result || result.error || !result.data) throw new EmailDeliveryError("provider_rejected");
      logger.info?.("auth_email_delivery", { purpose, success: true });
      return result.data;
    } catch (error) {
      const safeError = error instanceof EmailDeliveryError || error instanceof EmailConfigurationError
        ? error
        : new EmailDeliveryError("provider_unavailable");
      logger.error?.("auth_email_delivery", { purpose, success: false, reason: safeError.code });
      throw safeError;
    }
  }

  function sendVerificationEmail(user, token) {
    const link = buildPublicLink(`/verify-email/${token}`);
    return sendEmail({ to: user.email, purpose: "verification", subject: "Verify your AuraPay Sandbox Beta account", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Welcome to AuraPay Sandbox Beta</h2><p>Thank you for creating your AuraPay account.</p><p>Please verify your email address by clicking the button below.</p><p style="margin:30px 0"><a href="${link}" style="background:#2563EB;color:white;padding:14px 24px;text-decoration:none;border-radius:8px;display:inline-block">Verify Email</a></p><p>This verification link will expire in 24 hours.</p><hr><small>If you didn't create an AuraPay account, you can safely ignore this email.</small></div>` });
  }

  function sendPasswordResetEmail(user, token) {
    const link = buildPublicLink(`/reset-password/${token}`);
    return sendEmail({ to: user.email, purpose: "password_reset", subject: "Reset your AuraPay Sandbox Beta password", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>AuraPay Sandbox Beta Password Reset</h2><p>Someone requested a password reset for your AuraPay account.</p><p style="margin:30px 0"><a href="${link}" style="background:#111827;color:white;padding:14px 24px;text-decoration:none;border-radius:8px;display:inline-block">Reset Password</a></p><p>This link expires in one hour.</p><hr><small>If you didn't request this reset, you can safely ignore it.</small></div>` });
  }

  function sendAdminInvitationEmail(invitation, token) {
    const link = buildPublicLink(`/admin-invitation/${token}`);
    return sendEmail({ to: invitation.email, purpose: "admin_invitation", subject: "Your AuraPay Admin invitation", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>AuraPay Admin invitation</h2><p>You have been invited to the AuraPay Sandbox administration workspace as <strong>${invitation.role}</strong>.</p><p><a href="${link}" style="background:#2457d6;color:white;padding:14px 24px;text-decoration:none;border-radius:8px;display:inline-block">Activate admin access</a></p><p>This single-use invitation expires in 24 hours.</p><small>If you did not expect this invitation, you can ignore it.</small></div>` });
  }

  function sendAdminPasswordResetEmail(user, token) {
    const link = buildPublicLink(`/admin-reset-password/${token}`);
    return sendEmail({ to: user.email, purpose: "admin_password_reset", subject: "Reset your AuraPay Admin password", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Reset AuraPay Admin password</h2><p><a href="${link}" style="background:#111827;color:white;padding:14px 24px;text-decoration:none;border-radius:8px;display:inline-block">Reset admin password</a></p><p>This single-use link expires in one hour.</p><small>If you did not request this reset, you can ignore it.</small></div>` });
  }

  return { buildPublicLink, sendEmail, sendVerificationEmail, sendPasswordResetEmail, sendAdminInvitationEmail, sendAdminPasswordResetEmail };
}

const emailService = createEmailService();
module.exports = { ...emailService, EmailConfigurationError, EmailDeliveryError, createEmailService, normalizePublicBaseUrl, shouldExposeDevelopmentLinks, validateDeliveryConfig };
