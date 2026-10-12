const express = require("express");

const {
  StripeWebhookConfigurationError,
  StripeWebhookVerificationError,
  verifyStripeTestWebhook,
} = require("../services/stripeWebhookVerificationService");
const {
  ProviderWebhookActiveLeaseError,
  ProviderWebhookConflictError,
  ProviderWebhookPersistenceError,
  persistVerifiedWebhookEvent,
} = require("../services/providerWebhookEventService");

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

router.post("/", async (req, res) => {
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

    const persistence = await persistVerifiedWebhookEvent({
      event,
      rawBody: req.body,
    });

    return res.status(200).json({
      success: true,
      data: {
        received: true,
        verified: true,
        livemode: false,
        type: event.type,
        persisted: true,
        processing: "deferred",
        duplicate: persistence.disposition === "duplicate",
      },
    });
  } catch (error) {
    if (error instanceof StripeWebhookConfigurationError) {
      return failure(res, 503, "webhook_unavailable", "Stripe test webhook verification is unavailable.");
    }
    if (error instanceof StripeWebhookVerificationError) {
      return failure(res, 400, "invalid_webhook", "Stripe test webhook verification failed.");
    }
    if (error instanceof ProviderWebhookConflictError) {
      return failure(res, 409, "webhook_event_conflict", "Webhook event identity conflicts with prior content.");
    }
    if (error instanceof ProviderWebhookActiveLeaseError) {
      return failure(res, 409, "webhook_in_progress", "Webhook event recording is already in progress.");
    }
    if (error instanceof ProviderWebhookPersistenceError) {
      return failure(res, 503, "webhook_persistence_unavailable", "Webhook event could not be durably recorded.");
    }
    return failure(res, 400, "invalid_webhook", "Stripe test webhook verification failed.");
  }
});

module.exports = router;
