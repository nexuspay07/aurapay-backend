const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Merchant = require("../models/Merchant");
const User = require("../models/User");
const emailService = require("./emailService");
const { normalizeEmail, validateRegistration } = require("./publicAccountInput");

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const genericResendMessage = "If an eligible account exists, verification instructions will be sent.";
const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("hex");

async function registerMerchant(body, options = {}) {
  const validation = validateRegistration(body);
  if (!validation.valid) return { status: 400, body: { success: false, error: { code: "VALIDATION_ERROR", message: "Check the registration details and try again.", fields: validation.errors } } };
  const { value } = validation;
  const session = options.session || await mongoose.startSession();
  const ownsSession = !options.session;
  const rawToken = newToken();
  let merchant;
  let owner;
  try {
    await session.withTransaction(async () => {
      if (await User.exists({ email: value.ownerEmail }).session(session) || await Merchant.exists({ contactEmail: value.contactEmail }).session(session)) {
        const duplicate = new Error("duplicate"); duplicate.code = "PUBLIC_ACCOUNT_DUPLICATE"; throw duplicate;
      }
      const password = await bcrypt.hash(value.password, 10);
      [merchant] = await Merchant.create([{ businessName: value.businessName, legalName: value.legalName, businessType: value.businessType, contactEmail: value.contactEmail, country: value.country, ownerEmail: value.ownerEmail, verificationStatus: "pending", active: true }], { session });
      if (options.beforeOwnerCreate) await options.beforeOwnerCreate(merchant);
      [owner] = await User.create([{ email: value.ownerEmail, password, role: "merchant_owner", permissions: [], merchantId: merchant._id, status: "unverified", emailVerified: false, emailVerificationToken: tokenHash(rawToken), emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS) }], { session });
    });
  } catch (error) {
    if (error.code === "PUBLIC_ACCOUNT_DUPLICATE" || error.code === 11000) return { status: 409, body: { success: false, error: { code: "ACCOUNT_EXISTS", message: "An account with these registration details already exists." } } };
    throw error;
  } finally {
    if (ownsSession) await session.endSession();
  }

  let delivered = true;
  try { await (options.sendVerificationEmail || emailService.sendVerificationEmail)(owner, rawToken); }
  catch { delivered = false; }
  const bodyOut = { success: true, data: { merchantId: merchant._id, ownerEmail: owner.email, verificationRequired: true, emailDelivery: delivered ? "sent" : "pending" }, message: delivered ? "Check your email to verify your AuraPay Sandbox account." : "Your account was created, but we couldn't send the verification email. Try sending it again." };
  if (!delivered && process.env.NODE_ENV !== "production" && process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS === "true") bodyOut.data.developmentVerificationLink = emailService.buildPublicLink(`/verify-email/${rawToken}`);
  return { status: 201, body: bodyOut, merchant, owner, rawToken };
}

async function verifyEmail(rawToken) {
  const hash = tokenHash(String(rawToken || ""));
  const user = await User.findOneAndUpdate({ emailVerificationToken: hash, emailVerificationExpires: { $gt: new Date() }, emailVerified: false, frozen: { $ne: true } }, { $set: { emailVerified: true, status: "verified", emailVerificationToken: null, emailVerificationExpires: null } }, { new: true });
  if (!user) return { status: 400, body: { success: false, error: { code: "INVALID_OR_EXPIRED_TOKEN", message: "This verification link is invalid, expired, or already used." } } };
  return { status: 200, body: { success: true, message: "Email verified successfully. You can now sign in." }, user };
}

async function resendVerification(email, options = {}) {
  const normalized = normalizeEmail(email);
  const user = normalized ? await User.findOne({ email: normalized, role: "merchant_owner", emailVerified: false, frozen: { $ne: true } }).select("+emailVerificationToken") : null;
  if (!user) return { status: 200, body: { success: true, message: genericResendMessage } };
  const rawToken = newToken();
  user.emailVerificationToken = tokenHash(rawToken);
  user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_TTL_MS);
  await user.save();
  let delivered = true;
  try { await (options.sendVerificationEmail || emailService.sendVerificationEmail)(user, rawToken); } catch { delivered = false; }
  const body = { success: true, message: genericResendMessage };
  if (!delivered && process.env.NODE_ENV !== "production" && process.env.AURAPAY_EXPOSE_TEST_EMAIL_LINKS === "true") body.developmentVerificationLink = emailService.buildPublicLink(`/verify-email/${rawToken}`);
  return { status: 200, body, rawToken };
}

module.exports = { VERIFICATION_TTL_MS, genericResendMessage, registerMerchant, resendVerification, tokenHash, verifyEmail };
