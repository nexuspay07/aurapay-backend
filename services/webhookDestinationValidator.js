const dns = require("node:dns");
const net = require("node:net");

const blockedAddresses = new net.BlockList();

[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, "ipv4"));

[
  ["::", 96],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fec0::", 10],
  ["fe80::", 10],
  ["ff00::", 8],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, "ipv6"));

const blockedHostnames = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
]);

const blockedHostnameSuffixes = [
  ".localhost",
  ".internal",
  ".local",
  ".home",
  ".lan",
  ".corp",
];

class WebhookDestinationError extends Error {
  constructor(code = "destination_blocked") {
    super("Webhook destination is not allowed.");
    this.name = "WebhookDestinationError";
    this.code = code;
  }
}

function normalizeHostname(hostname) {
  return String(hostname || "")
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function mappedIpv4(address) {
  const normalized = String(address).toLowerCase();
  const dotted = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicAddress(address) {
  const mapped = mappedIpv4(address);
  if (mapped) return isPublicAddress(mapped);

  const family = net.isIP(address);
  if (family === 4) return !blockedAddresses.check(address, "ipv4");
  if (family === 6) return !blockedAddresses.check(address, "ipv6");
  return false;
}

async function validateWebhookDestination(rawUrl, options = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebhookDestinationError("invalid_webhook_url");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new WebhookDestinationError("invalid_webhook_url");
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    !hostname ||
    blockedHostnames.has(hostname) ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new WebhookDestinationError();
  }

  const literalFamily = net.isIP(hostname);
  let addresses;
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    const lookup = options.lookup || dns.promises.lookup;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new WebhookDestinationError("destination_unresolvable");
    }
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new WebhookDestinationError("destination_unresolvable");
  }

  const normalizedAddresses = addresses.map((entry) => ({
    address: String(entry.address),
    family: Number(entry.family) || net.isIP(entry.address),
  }));

  if (
    normalizedAddresses.some(
      (entry) => !entry.family || !isPublicAddress(entry.address)
    )
  ) {
    throw new WebhookDestinationError();
  }

  return { url, hostname, addresses: normalizedAddresses };
}

module.exports = {
  WebhookDestinationError,
  isPublicAddress,
  normalizeHostname,
  validateWebhookDestination,
};
