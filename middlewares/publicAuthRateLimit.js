const buckets = new Map();

function keyFor(req, scope) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() :
    typeof req.body?.ownerEmail === "string" ? req.body.ownerEmail.trim().toLowerCase() : "-";
  return `${scope}:${req.ip || req.socket?.remoteAddress || "unknown"}:${email}`;
}

function publicAuthRateLimit(scope, { limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFor(req, scope);
    const current = buckets.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    buckets.set(key, entry);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
    if (entry.count > limit) return res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
    next();
  };
}

function resetPublicAuthRateLimits() { buckets.clear(); }

module.exports = { publicAuthRateLimit, resetPublicAuthRateLimits };
