const express = require("express");

const apiKeyAuth = require("../../../middlewares/apiKeyAuth");
const apiRateLimit = require("../../../middlewares/apiRateLimit");
const requireApiPermission = require("../../../middlewares/apiPermission");
const IdempotencyKey = require("../../../models/IdempotencyKey");
const Transaction = require("../../../models/Transaction");
const CheckoutSession = require("../../../models/CheckoutSession");
const Settlement = require("../../../models/Settlement");
const checkoutService = require("../../../services/checkoutService");
const sandboxPaymentSimulationService = require("../../../services/sandboxPaymentSimulationService");

const {
  failure,
  hashPayload,
  isObjectId,
  normalizeCheckout,
  normalizeSettlement,
  normalizeTransaction,
  paginationMeta,
  parsePagination,
  success,
  validAmount,
  validCurrency,
  validEmail,
} = require("./utils");

const router = express.Router();

router.use(apiKeyAuth);
router.use(apiRateLimit);

router.use((req, res, next) => {
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

function sendSuccess(res, data, meta = {}, statusCode = 200) {
  res.locals.apiResponseSummary = {
    success: true,
    statusCode,
  };
  return success(res, data, meta, statusCode);
}

function sendFailure(res, statusCode, code, message) {
  res.locals.apiResponseSummary = {
    success: false,
    statusCode,
    code,
  };
  return failure(res, statusCode, code, message);
}

async function withIdempotency(req, res, endpoint, handler) {
  const key = req.headers["idempotency-key"];

  if (!key) {
    return sendFailure(
      res,
      400,
      "missing_idempotency_key",
      "Idempotency-Key header is required."
    );
  }

  const requestHash = hashPayload(req.body);
  const existing = await IdempotencyKey.findOne({
    merchant: req.merchant._id,
    endpoint,
    key,
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return sendFailure(
        res,
        409,
        "idempotency_conflict",
        "Idempotency key was already used with a different payload."
      );
    }

    res.locals.apiResponseSummary = {
      success: true,
      statusCode: existing.statusCode,
      idempotentReplay: true,
    };

    return res.status(existing.statusCode).json(existing.responseBody);
  }

  const result = await handler();
  await IdempotencyKey.create({
    merchant: req.merchant._id,
    endpoint,
    key,
    requestHash,
    statusCode: result.statusCode,
    responseBody: result.body,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  res.locals.apiResponseSummary = {
    success: true,
    statusCode: result.statusCode,
  };

  return res.status(result.statusCode).json(result.body);
}

function listQuery(model, req, baseFilter, normalizer, allowedStatuses = []) {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {
    ...baseFilter,
  };

  if (req.query.status) {
    if (!allowedStatuses.includes(req.query.status)) {
      return {
        error: "Invalid status filter.",
      };
    }

    filter.status = req.query.status;
  }

  return Promise.all([
    model.countDocuments(filter),
    model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]).then(([total, records]) => ({
    data: records.map(normalizer),
    meta: paginationMeta(page, limit, total),
  }));
}

router.get("/account", requireApiPermission("account:read"), (req, res) => {
  return sendSuccess(res, {
    id: req.merchant._id,
    businessName: req.merchant.businessName,
    legalName: req.merchant.legalName,
    verificationStatus: req.merchant.verificationStatus,
    riskLevel: req.merchant.riskLevel,
    environment: req.environment,
  });
});

router.get("/", (req, res) => {
  return sendSuccess(res, {
    name: "AuraPay API v1",
    environment: "sandbox",
    livemode: false,
    message: "Sandbox Beta API. No real funds are processed.",
    paymentScenarios: sandboxPaymentSimulationService.getScenarios(),
  });
});

router.post("/payments", requireApiPermission("payments:create"), async (req, res) => {
  try {
    const { amount, currency, customerEmail, description = "", scenario = "success" } = req.body;

    if (!validAmount(amount)) {
      return sendFailure(res, 400, "invalid_request", "Amount must be greater than zero.");
    }

    if (!validCurrency(currency)) {
      return sendFailure(res, 400, "invalid_request", "Currency must be a valid ISO code.");
    }

    if (customerEmail && !validEmail(customerEmail)) {
      return sendFailure(res, 400, "invalid_request", "Customer email is invalid.");
    }

    return await withIdempotency(req, res, "POST /api/v1/payments", async () => {
      const result = await sandboxPaymentSimulationService.simulatePayment({
        merchant: req.merchant._id,
        amount: Number(amount),
        currency: String(currency).toUpperCase(),
        customerEmail,
        description,
        scenario,
        idempotencyKey: req.headers["idempotency-key"],
      });

      return {
        statusCode: 201,
        body: {
          success: true,
          data: normalizeTransaction(result.transaction),
          meta: {
            scenario: result.scenario,
            outcome: result.outcome.code,
            settlementId: result.settlement?._id || null,
          },
        },
      };
    });
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to create payment.");
  }
});

router.get("/payments", requireApiPermission("payments:read"), async (req, res) => {
  try {
    const result = await listQuery(
      Transaction,
      req,
      { merchant: req.merchant._id },
      normalizeTransaction,
      ["pending", "processing", "provider_confirmed", "completed", "failed", "cancelled", "refunded"]
    );

    if (result.error) {
      return sendFailure(res, 400, "invalid_request", result.error);
    }

    return sendSuccess(res, result.data, result.meta);
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load payments.");
  }
});

router.get("/payments/:id", requireApiPermission("payments:read"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return sendFailure(res, 400, "invalid_request", "Invalid ID.");
    }

    const transaction = await Transaction.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!transaction) {
      return sendFailure(res, 404, "not_found", "Payment not found.");
    }

    return sendSuccess(res, normalizeTransaction(transaction));
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load payment.");
  }
});

router.post("/refunds", requireApiPermission("refunds:create"), async (req, res) => {
  try {
    const { transactionId, amount, reason = "requested_by_customer" } = req.body;

    if (!isObjectId(transactionId)) {
      return sendFailure(res, 400, "invalid_request", "Invalid ID.");
    }

    if (amount && !validAmount(amount)) {
      return sendFailure(res, 400, "invalid_request", "Refund amount must be greater than zero.");
    }

    return await withIdempotency(req, res, "POST /api/v1/refunds", async () => {
      try {
        const result = await sandboxPaymentSimulationService.refund({
          merchant: req.merchant._id,
          transactionId,
          amount: amount ? Number(amount) : undefined,
          reason,
        });

        return {
          statusCode: 201,
          body: {
            success: true,
            data: normalizeTransaction(result.transaction),
            meta: {
              refundAmount: result.refundAmount,
              totalRefunded: result.totalRefunded,
              settlementId: result.settlement?._id || null,
            },
          },
        };
      } catch (err) {
        const statusCode = err.statusCode || 500;
        return {
          statusCode,
          body: {
            success: false,
            error: {
              code: statusCode === 404 ? "not_found" : "invalid_request",
              message: err.message,
            },
          },
        };
      }
    });
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to create refund.");
  }
});

router.get("/refunds", requireApiPermission("refunds:read"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {
      merchant: req.merchant._id,
      "refund.refundAmount": { $gt: 0 },
    };

    const [total, records] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ]);

    return sendSuccess(
      res,
      records.map(normalizeTransaction),
      paginationMeta(page, limit, total)
    );
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load refunds.");
  }
});

router.get("/refunds/:id", requireApiPermission("refunds:read"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return sendFailure(res, 400, "invalid_request", "Invalid ID.");
    }

    const transaction = await Transaction.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
      "refund.refundAmount": { $gt: 0 },
    });

    if (!transaction) {
      return sendFailure(res, 404, "not_found", "Refund not found.");
    }

    return sendSuccess(res, normalizeTransaction(transaction));
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load refund.");
  }
});

router.post("/checkouts", requireApiPermission("checkouts:create"), async (req, res) => {
  try {
    const { amount, currency, customerEmail, description = "" } = req.body;

    if (!validAmount(amount)) {
      return sendFailure(res, 400, "invalid_request", "Amount must be greater than zero.");
    }

    if (!validCurrency(currency)) {
      return sendFailure(res, 400, "invalid_request", "Currency must be a valid ISO code.");
    }

    if (customerEmail && !validEmail(customerEmail)) {
      return sendFailure(res, 400, "invalid_request", "Customer email is invalid.");
    }

    return await withIdempotency(req, res, "POST /api/v1/checkouts", async () => {
      const session = await checkoutService.createSession(req.merchant._id, {
        amount: Number(amount),
        currency: String(currency).toUpperCase(),
        customerEmail,
        description,
      });

      return {
        statusCode: 201,
        body: {
          success: true,
          data: normalizeCheckout(session),
          meta: {},
        },
      };
    });
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to create checkout.");
  }
});

router.get("/checkouts", requireApiPermission("checkouts:read"), async (req, res) => {
  try {
    const result = await listQuery(
      CheckoutSession,
      req,
      { merchant: req.merchant._id },
      normalizeCheckout,
      ["created", "pending", "paid", "failed", "expired"]
    );

    if (result.error) {
      return sendFailure(res, 400, "invalid_request", result.error);
    }

    return sendSuccess(res, result.data, result.meta);
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load checkouts.");
  }
});

router.get("/checkouts/:id", requireApiPermission("checkouts:read"), async (req, res) => {
  try {
    const filter = {
      merchant: req.merchant._id,
    };

    if (isObjectId(req.params.id)) {
      filter._id = req.params.id;
    } else {
      filter.sessionId = req.params.id;
    }

    const session = await CheckoutSession.findOne(filter);

    if (!session) {
      return sendFailure(res, 404, "not_found", "Checkout not found.");
    }

    return sendSuccess(res, normalizeCheckout(session));
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load checkout.");
  }
});

router.get("/transactions", requireApiPermission("transactions:read"), async (req, res) => {
  try {
    const result = await listQuery(
      Transaction,
      req,
      { merchant: req.merchant._id },
      normalizeTransaction,
      ["pending", "processing", "provider_confirmed", "completed", "failed", "cancelled", "refunded"]
    );

    if (result.error) {
      return sendFailure(res, 400, "invalid_request", result.error);
    }

    return sendSuccess(res, result.data, result.meta);
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load transactions.");
  }
});

router.get("/transactions/:id", requireApiPermission("transactions:read"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return sendFailure(res, 400, "invalid_request", "Invalid ID.");
    }

    const transaction = await Transaction.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!transaction) {
      return sendFailure(res, 404, "not_found", "Transaction not found.");
    }

    return sendSuccess(res, normalizeTransaction(transaction));
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load transaction.");
  }
});

router.get("/settlements", requireApiPermission("settlements:read"), async (req, res) => {
  try {
    const result = await listQuery(
      Settlement,
      req,
      { merchant: req.merchant._id },
      normalizeSettlement,
      ["pending", "processing", "completed", "failed", "refunded"]
    );

    if (result.error) {
      return sendFailure(res, 400, "invalid_request", result.error);
    }

    return sendSuccess(res, result.data, result.meta);
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load settlements.");
  }
});

router.get("/settlements/:id", requireApiPermission("settlements:read"), async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return sendFailure(res, 400, "invalid_request", "Invalid ID.");
    }

    const settlement = await Settlement.findOne({
      _id: req.params.id,
      merchant: req.merchant._id,
    });

    if (!settlement) {
      return sendFailure(res, 404, "not_found", "Settlement not found.");
    }

    return sendSuccess(res, normalizeSettlement(settlement));
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to load settlement.");
  }
});

module.exports = router;
