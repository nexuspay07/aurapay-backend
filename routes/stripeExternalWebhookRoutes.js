const express = require("express");

const {
  StripeWebhookConfigurationError,
  StripeWebhookVerificationError,
  verifyStripeTestWebhook,
} = require("../services/stripeWebhookVerificationService");

const router = express.Router();

function failure(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function signatureHeader(req) {
  const occurrences = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (String(req.rawHeaders[index]).toLowerCase() === "stripe-signature") {
      occurrences.push(req.rawHeaders[index + 1]);
    }
  }

  if (occurrences.length !== 1 || typeof occurrences[0] !== "string" || !occurrences[0].trim()) {
    throw new StripeWebhookVerificationError("Stripe signature is missing or ambiguous.");
  }

  return occurrences[0];
}

router.post("/", (req, res) => {
  if (!req.is("application/json")) {
    return failure(res, 415, "unsupported_media_type", "Webhook content type must be application/json.");
  }

  if (!Buffer.isBuffer(req.body)) {
    return failure(res, 400, "invalid_webhook", "Webhook body must be supplied as raw JSON bytes.");
  }

  try {
    const event = verifyStripeTestWebhook({
      rawBody: req.body,
      signature: signatureHeader(req),
    });

    return res.status(200).json({
      success: true,
      data: {
        received: true,
        verified: true,
        livemode: false,
        type: event.type,
        processing: "not_started",
      },
    });
  } catch (error) {
    if (error instanceof StripeWebhookConfigurationError) {
      return failure(res, 503, "webhook_unavailable", "Stripe test webhook verification is unavailable.");
    }
    if (error instanceof StripeWebhookVerificationError) {
      return failure(res, 400, "invalid_webhook", "Stripe test webhook verification failed.");
    }
    return failure(res, 400, "invalid_webhook", "Stripe test webhook verification failed.");
  }
});

module.exports = router;
