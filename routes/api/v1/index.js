const express = require("express");

const apiKeyAuth = require("../../../middlewares/apiKeyAuth");
const apiRateLimit = require("../../../middlewares/apiRateLimit");
const requireApiPermission = require("../../../middlewares/apiPermission");
const IdempotencyKey = require("../../../models/IdempotencyKey");
const Transaction = require("../../../models/Transaction");
const CheckoutSession = require("../../../models/CheckoutSession");
const Settlement = require("../../../models/Settlement");
const paymentProcessingService = require("../../../services/paymentProcessingService");
const checkoutService = require("../../../services/checkoutService");
const settlementService = require("../../../services/settlementService");

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

router.post("/payments", requireApiPermission("payments:create"), async (req, res) => {
  try {
    const { amount, currency, customerEmail, provider = "Test" } = req.body;

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
      const paymentIntentId = `test_pi_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const transaction = await paymentProcessingService.processSuccessfulPayment({
        merchant: req.merchant._id,
        checkoutSession: null,
        paymentIntentId,
        amount: Number(amount),
        currency: String(currency).toLowerCase(),
        customerEmail,
        provider,
      });

      await settlementService.createSettlement({
        merchant: req.merchant._id,
        transaction: transaction._id,
        amount: transaction.amount,
        currency: transaction.currency,
        merchantNet: transaction.merchantNet || transaction.amount,
      });

      return {
        statusCode: 201,
        body: {
          success: true,
          data: normalizeTransaction(transaction),
          meta: {},
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
      const transaction = await Transaction.findOne({
        _id: transactionId,
        merchant: req.merchant._id,
      });

      if (!transaction) {
        return {
          statusCode: 404,
          body: {
            success: false,
            error: {
              code: "not_found",
              message: "Transaction not found.",
            },
          },
        };
      }

      if (transaction.status !== "completed") {
        return {
          statusCode: 400,
          body: {
            success: false,
            error: {
              code: "invalid_request",
              message: "Only completed transactions can be refunded.",
            },
          },
        };
      }

      const refundAmount = Number(amount || transaction.amount);
      if (refundAmount > Number(transaction.amount)) {
        return {
          statusCode: 400,
          body: {
            success: false,
            error: {
              code: "invalid_request",
              message: "Refund amount cannot exceed transaction amount.",
            },
          },
        };
      }

      transaction.status = "refunded";
      transaction.success = false;
      transaction.refundedAt = new Date();
      transaction.refund = {
        providerRefundId: `test_re_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        providerRefundStatus: "succeeded",
        refundAmount,
        refundCurrency: transaction.currency,
        refundReason: reason,
        refundRequestedAt: new Date(),
        refundCompletedAt: new Date(),
      };

      await transaction.save();
      await settlementService.applyRefund(transaction._id, refundAmount).catch(() => null);

      return {
        statusCode: 201,
        body: {
          success: true,
          data: normalizeTransaction(transaction),
          meta: {},
        },
      };
    });
  } catch (err) {
    return sendFailure(res, 500, "internal_error", "Failed to create refund.");
  }
});

router.get("/refunds", requireApiPermission("refunds:read"), async (req, res) => {
  try {
    const result = await listQuery(
      Transaction,
      req,
      { merchant: req.merchant._id, status: "refunded" },
      normalizeTransaction,
      ["refunded"]
    );

    return sendSuccess(res, result.data, result.meta);
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
      status: "refunded",
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
    const { amount, currency, customerEmail } = req.body;

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
