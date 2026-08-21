const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function cleanString(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum + 1) : "";
}

function validateEmail(value) {
  return value.length <= 254 && EMAIL_RE.test(value);
}

function validateRegistration(body = {}) {
  const value = {
    businessName: cleanString(body.businessName, 120),
    legalName: cleanString(body.legalName, 160),
    businessType: cleanString(body.businessType, 40),
    contactEmail: normalizeEmail(body.contactEmail),
    country: cleanString(body.country, 80),
    ownerEmail: normalizeEmail(body.ownerEmail),
    password: typeof body.password === "string" ? body.password : "",
  };
  const errors = {};
  if (!value.businessName || value.businessName.length > 120) errors.businessName = "Business name is required and must be 120 characters or fewer.";
  if (!value.legalName || value.legalName.length > 160) errors.legalName = "Legal name is required and must be 160 characters or fewer.";
  if (!["sole_proprietorship", "corporation", "partnership", "non_profit", "other"].includes(value.businessType)) errors.businessType = "Select a valid business type.";
  if (!validateEmail(value.contactEmail)) errors.contactEmail = "Enter a valid business email address.";
  if (!validateEmail(value.ownerEmail)) errors.ownerEmail = "Enter a valid owner email address.";
  if (!value.country || value.country.length > 80) errors.country = "Country is required and must be 80 characters or fewer.";
  if (!PASSWORD_RE.test(value.password)) errors.password = "Password must be 10-128 characters and include uppercase, lowercase, and a number.";
  const forbidden = ["role", "permissions", "merchantId", "adminSecurityVersion", "merchantSecurityVersion"];
  if (forbidden.some((field) => Object.prototype.hasOwnProperty.call(body, field))) errors.account = "Account role, permissions, and ownership cannot be assigned during public registration.";
  return { value, errors, valid: Object.keys(errors).length === 0 };
}

module.exports = { normalizeEmail, validateEmail, validateRegistration, PASSWORD_RE };
