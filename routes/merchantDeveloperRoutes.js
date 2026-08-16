const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const apiKeyService = require("../services/apiKeyService");
const merchantWebhookService = require("../services/merchantWebhookService");
const merchantAuth = require("../middlewares/merchantAuth");
const Application = require("../models/Application");
const ApiKey = require("../models/ApiKey");
const ApiLog = require("../models/ApiLog");
const MerchantWebhook = require("../models/MerchantWebhook");
const WebhookDelivery = require("../models/WebhookDelivery");

const router = express.Router();

router.use(merchantAuth);

const DEFAULT_API_PERMISSIONS = [
  "account:read",
  "payments:create",
  "payments:read",
  "checkouts:create",
  "checkouts:read",
  "refunds:create",
  "refunds:read",
  "transactions:read",
  "settlements:read",
  "webhooks:manage",
];

const WEBHOOK_EVENTS = [
  "payment.created",
  "payment.completed",
  "payment.failed",
  "payment.refunded",
  "checkout.created",
  "checkout.paid",
  "settlement.created",
  "settlement.completed",
];

function invalidId(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid ID.",
  });
}

function invalidWebhookUrl(res) {
  return res.status(400).json({
    success: false,
    error: {
      code: "INVALID_WEBHOOK_URL",
      message: "Webhook URL must be a publicly reachable HTTPS endpoint.",
    },
    message: "Webhook URL must be a publicly reachable HTTPS endpoint.",
  });
}

function serializeApiKey(key) {
  return {
    _id: key._id,
    name: key.name,
    publicKey: key.publicKey,
    environment: key.environment,
    permissions: key.permissions || [],
    status: key.active ? "active" : "revoked",
    active: key.active,
    lastUsed: key.lastUsedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    expiresAt: key.expiresAt,
  };
}

router.get("/api-keys", async (req, res) => {
  try {
    const keys = await apiKeyService.listMerchantKeys(req.merchant._id);

    return res.json({
      success: true,
      data: keys.map(serializeApiKey),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load API keys.",
    });
  }
});

router.post("/api-keys", async (req, res) => {
  try {
    const { name, environment = "sandbox", permissions = [] } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "API key name is required.",
      });
    }

    const allowedPermissions = Array.isArray(permissions)
      ? permissions.filter((permission) =>
          DEFAULT_API_PERMISSIONS.includes(permission)
        )
      : [];

    const result = await apiKeyService.createApiKey({
      merchant: req.merchant._id,
      name: String(name).trim(),
      environment,
      permissions: allowedPermissions,
    });

    return res.status(201).json({
      success: true,
      message: "API key created.",
      data: {
        apiKey: serializeApiKey(result.apiKey),
        secretKey: result.secretKey,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to create API key.",
    });
  }
});

router.patch("/api-keys/:id/rotate", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const existing = await apiKeyService.listMerchantKeys(req.merchant._id);
    const owned = existing.some(
      (key) => key._id.toString() === req.params.id
    );

    if (!owned) {
      return res.status(404).json({
        success: false,
        message: "API key not found.",
      });
    }

    const result = await apiKeyService.rotateKey(req.params.id);

    return res.json({
      success: true,
      message: "API key rotated.",
      data: {
        apiKey: serializeApiKey(result.apiKey),
        secretKey: result.secretKey,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to rotate API key.",
    });
  }
});

router.patch("/api-keys/:id/revoke", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const existing = await apiKeyService.listMerchantKeys(req.merchant._id);
    const owned = existing.some(
      (key) => key._id.toString() === req.params.id
    );

    if (!owned) {
      return res.status(404).json({
        success: false,
        message: "API key not found.",
      });
    }

    const key = await apiKeyService.revokeKey(req.params.id);

    return res.json({
      success: true,
      message: "API key revoked.",
      data: serializeApiKey(key),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to revoke API key.",
    });
  }
});

router.delete("/api-keys/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const key = await ApiKey.findOneAndDelete({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!key) {
      return res.status(404).json({
        success: false,
        message: "API key not found.",
      });
    }

    return res.json({
      success: true,
      message: "API key deleted.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete API key.",
    });
  }
});

router.get("/applications", async (req, res) => {
  try {
    const applications = await Application.find({
      merchant: req.merchant._id,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: applications,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load applications.",
    });
  }
});

router.get("/applications/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const application = await Application.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found.",
      });
    }

    return res.json({
      success: true,
      data: application,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load application.",
    });
  }
});

router.post("/applications", async (req, res) => {
  try {
    const {
      name,
      description = "",
      website = "",
      logo = "",
      redirectUris = [],
      allowedOrigins = [],
      environment = "sandbox",
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Application name is required.",
      });
    }

    const application = await Application.create({
      merchant: req.merchant._id,
      name: String(name).trim(),
      description,
      website,
      logo,
      redirectUris,
      allowedOrigins,
      environment,
    });

    return res.status(201).json({
      success: true,
      message: "Application created.",
      data: application,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to create application.",
    });
  }
});

router.put("/applications/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const allowedUpdates = [
      "name",
      "description",
      "website",
      "logo",
      "redirectUris",
      "allowedOrigins",
      "environment",
      "active",
    ];

    const updates = {};
    allowedUpdates.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    const application = await Application.findOneAndUpdate(
      {
        _id: req.params.id,
        merchant: req.merchant._id,
      },
      updates,
      { new: true }
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found.",
      });
    }

    return res.json({
      success: true,
      message: "Application updated.",
      data: application,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update application.",
    });
  }
});

router.delete("/applications/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const application = await Application.findOneAndDelete({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found.",
      });
    }

    return res.json({
      success: true,
      message: "Application deleted.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete application.",
    });
  }
});

router.get("/webhooks", async (req, res) => {
  try {
    const webhooks = await MerchantWebhook.find({
      merchant: req.merchant._id,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: webhooks.map((webhook) => ({
        _id: webhook._id,
        url: webhook.url,
        eventTypes: webhook.eventTypes || [],
        status: !webhook.active
          ? "disabled"
          : webhook.lastDeliveryStatus === "failed"
          ? "failed"
          : "healthy",
        active: webhook.active,
        lastDelivery: webhook.lastDeliveryAt,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load webhooks.",
    });
  }
});

router.post("/webhooks", async (req, res) => {
  try {
    const { url, eventTypes = [] } = req.body;

    if (!url || !String(url).trim()) {
      return res.status(400).json({
        success: false,
        message: "Webhook URL is required.",
      });
    }

    try {
      await merchantWebhookService.validateDestination(String(url).trim());
    } catch {
      return invalidWebhookUrl(res);
    }

    const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`;
    const selectedEvents = Array.isArray(eventTypes)
      ? eventTypes.filter((eventType) => WEBHOOK_EVENTS.includes(eventType))
      : [];

    const webhook = await MerchantWebhook.create({
      merchant: req.merchant._id,
      url: String(url).trim(),
      secret,
      eventTypes: selectedEvents,
      active: true,
    });

    return res.status(201).json({
      success: true,
      message: "Webhook created.",
      data: {
        webhook: {
          _id: webhook._id,
          url: webhook.url,
          eventTypes: webhook.eventTypes,
          active: webhook.active,
          status: "healthy",
          createdAt: webhook.createdAt,
        },
        signingSecret: secret,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to create webhook.",
    });
  }
});

router.put("/webhooks/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const updates = {};
    ["url", "eventTypes", "active"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    if (updates.eventTypes) {
      updates.eventTypes = Array.isArray(updates.eventTypes)
        ? updates.eventTypes.filter((eventType) =>
            WEBHOOK_EVENTS.includes(eventType)
          )
        : [];
    }

    if (Object.prototype.hasOwnProperty.call(updates, "url")) {
      if (!updates.url || !String(updates.url).trim()) {
        return invalidWebhookUrl(res);
      }

      try {
        await merchantWebhookService.validateDestination(
          String(updates.url).trim()
        );
      } catch {
        return invalidWebhookUrl(res);
      }
      updates.url = String(updates.url).trim();
    }

    const webhook = await MerchantWebhook.findOneAndUpdate(
      {
        _id: req.params.id,
        merchant: req.merchant._id,
      },
      updates,
      { new: true }
    );

    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: "Webhook not found.",
      });
    }

    return res.json({
      success: true,
      message: "Webhook updated.",
      data: {
        _id: webhook._id,
        url: webhook.url,
        eventTypes: webhook.eventTypes,
        active: webhook.active,
        lastDeliveryAt: webhook.lastDeliveryAt,
        lastDeliveryStatus: webhook.lastDeliveryStatus,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update webhook.",
    });
  }
});

router.patch("/webhooks/:id/regenerate-secret", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`;
    const webhook = await MerchantWebhook.findOneAndUpdate(
      {
        _id: req.params.id,
        merchant: req.merchant._id,
      },
      { secret },
      { new: true }
    );

    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: "Webhook not found.",
      });
    }

    return res.json({
      success: true,
      message: "Webhook signing secret regenerated.",
      data: {
        webhookId: webhook._id,
        signingSecret: secret,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to regenerate webhook secret.",
    });
  }
});

router.post("/webhooks/:id/test", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const webhook = await MerchantWebhook.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
    }).select("+secret");

    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: "Webhook not found.",
      });
    }

    const payload = {
      id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
      type: "webhook.test",
      object: "event",
      created: new Date().toISOString(),
    };
    const startedAt = Date.now();
    let result;

    if (!webhook.active) {
      result = {
        status: "failed",
        statusCode: null,
        latencyMs: Date.now() - startedAt,
        errorCode: "webhook_disabled",
        errorMessage: "Webhook is disabled.",
        deliveredAt: null,
      };
    } else {
      result = await merchantWebhookService.attemptDelivery(
        webhook,
        payload,
        "webhook.test"
      );
    }

    const delivery = await WebhookDelivery.create({
      merchant: req.merchant._id,
      webhook: webhook._id,
      eventType: "webhook.test",
      status: result.status,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      attempts: 1,
      deliveredAt: result.deliveredAt,
      payloadPreview: payload,
    });

    webhook.lastDeliveryAt = new Date();
    webhook.lastDeliveryStatus = delivery.status;
    await webhook.save();

    return res.json({
      success: true,
      message: "Webhook test recorded.",
      data: delivery,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to test webhook.",
    });
  }
});

router.delete("/webhooks/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const webhook = await MerchantWebhook.findOneAndDelete({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: "Webhook not found.",
      });
    }

    return res.json({
      success: true,
      message: "Webhook deleted.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete webhook.",
    });
  }
});

router.get("/webhooks/:id/deliveries", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const webhook = await MerchantWebhook.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: "Webhook not found.",
      });
    }

    const deliveries = await WebhookDelivery.find({
      merchant: req.merchant._id,
      webhook: webhook._id,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: deliveries,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load webhook deliveries.",
    });
  }
});

router.post("/webhook-deliveries/:id/retry", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return invalidId(res);
    }

    const delivery = await WebhookDelivery.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found.",
      });
    }

    const webhook = await MerchantWebhook.findOne({
      _id: delivery.webhook,
      merchant: req.merchant._id,
    }).select("+secret");

    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: "Webhook not found.",
      });
    }

    const payload = delivery.payloadPreview || {};
    const startedAt = Date.now();

    delivery.attempts += 1;

    if (!webhook.active) {
      delivery.status = "failed";
      delivery.statusCode = null;
      delivery.errorCode = "webhook_disabled";
      delivery.errorMessage = "Webhook is disabled.";
      delivery.latencyMs = Date.now() - startedAt;
    } else {
      const result = await merchantWebhookService.attemptDelivery(
        webhook,
        payload,
        delivery.eventType
      );
      delivery.status = result.status;
      delivery.statusCode = result.statusCode;
      delivery.errorCode = result.errorCode;
      delivery.errorMessage = result.errorMessage;
      delivery.latencyMs = result.latencyMs;
      delivery.deliveredAt = result.deliveredAt || delivery.deliveredAt;
    }

    await delivery.save();

    webhook.lastDeliveryAt = new Date();
    webhook.lastDeliveryStatus = delivery.status;
    await webhook.save();

    return res.json({
      success: true,
      message: "Webhook delivery retried.",
      data: delivery,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to retry webhook delivery.",
    });
  }
});

router.get("/api-logs", async (req, res) => {
  try {
    const logs = await ApiLog.find({
      merchant: req.merchant._id,
    })
      .populate("apiKey", "name publicKey environment")
      .sort({ createdAt: -1 })
      .limit(1000);

    return res.json({
      success: true,
      data: logs,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load API logs.",
    });
  }
});

router.get("/metadata", async (req, res) => {
  return res.json({
    success: true,
    data: {
      apiPermissions: DEFAULT_API_PERMISSIONS,
      webhookEvents: WEBHOOK_EVENTS,
    },
  });
});

module.exports = router;
