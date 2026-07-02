const crypto = require("crypto");

function generateSlug(title = "") {
  const base = title
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const random = crypto
    .randomBytes(4)
    .toString("hex");

  return `${base}-${random}`;
}

module.exports = generateSlug;