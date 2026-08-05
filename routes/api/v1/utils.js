const crypto = require("crypto");
const mongoose = require("mongoose");

function success(res, data, meta = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta,
  });
}

function failure(res, statusCode, code, message) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function parsePagination(query) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function paginationMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

function validAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function validCurrency(value) {
  return /^[A-Z]{3}$/i.test(String(value || ""));
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function validUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
}

function normalizeTransaction(transaction) {
  if (!transaction) return null;
  return {
    id: transaction._id,
    amount: transaction.amount,
    currency: transaction.currency,
    provider: transaction.provider,
    status: transaction.status,
    success: transaction.success,
    customerEmail: transaction.customerEmail,
    paymentId: transaction.providerPaymentId || transaction.transactionId,
    fees: transaction.merchantFee || transaction.estimatedFee || 0,
    netAmount:
      transaction.merchantNet ||
      transaction.estimatedNet ||
      transaction.amount,
    refund: transaction.refund,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

function normalizeCheckout(session) {
  if (!session) return null;
  return {
    id: session._id,
    checkoutId: session.sessionId,
    amount: session.amount,
    currency: session.currency,
    customerEmail: session.customerEmail,
    status: session.status,
    provider: session.provider,
    url: `/pay/${session.sessionId}`,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function normalizeSettlement(settlement) {
  if (!settlement) return null;
  return {
    id: settlement._id,
    amount: settlement.amount,
    fees: Math.max(
      0,
      Number(settlement.amount || 0) - Number(settlement.netAmount || 0)
    ),
    netAmount: settlement.netAmount,
    currency: settlement.currency,
    status: settlement.status,
    transactionCount: settlement.transactionCount,
    settlementDate: settlement.settlementDate,
    createdAt: settlement.createdAt,
    updatedAt: settlement.updatedAt,
  };
}

module.exports = {
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
  validUrl,
};
