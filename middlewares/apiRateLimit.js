const buckets = new Map();

module.exports = function apiRateLimit(req, res, next) {
  const limit = Number(process.env.API_RATE_LIMIT_MAX || 120);
  const windowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60000);
  const now = Date.now();
  const apiKeyId = req.apiKey?._id?.toString() || "unknown-key";
  const merchantId = req.merchant?._id?.toString() || "unknown-merchant";
  const bucketKey = `${merchantId}:${apiKeyId}`;
  const bucket = buckets.get(bucketKey) || {
    resetAt: now + windowMs,
    count: 0,
  };

  if (bucket.resetAt <= now) {
    bucket.resetAt = now + windowMs;
    bucket.count = 0;
  }

  bucket.count += 1;
  buckets.set(bucketKey, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(remaining));

  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));

    return res.status(429).json({
      success: false,
      error: {
        code: "rate_limited",
        message: "Rate limit exceeded.",
      },
    });
  }

  next();
};
