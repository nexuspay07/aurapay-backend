const http = require("http");
const mongoose = require("mongoose");

const app = require("../app");
const ApiLog = require("../models/ApiLog");
const ApiKey = require("../models/ApiKey");
const Merchant = require("../models/Merchant");
const Transaction = require("../models/Transaction");
const apiKeyService = require("../services/apiKeyService");

async function main() {
  const runId = `smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let merchant = null;
  let server = null;
  const mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI_TEST or MONGO_URI is required for smoke test");
  }

  try {
  await mongoose.connect(mongoUri);

  merchant = await Merchant.create({
    businessName: `Smoke Merchant ${runId}`,
    legalName: `Smoke Merchant ${runId} LLC`,
    businessType: "corporation",
    contactEmail: `smoke-${Date.now()}@aurapay.test`,
    country: "US",
    active: true,
    verificationStatus: "verified",
  });

  const key = await apiKeyService.createApiKey({
    merchant: merchant._id,
    name: "Smoke key",
    environment: "sandbox",
    permissions: ["account:read"],
  });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${baseUrl}/api/v1/account`, {
    headers: {
      Authorization: `Bearer ${key.secretKey}`,
      "X-Request-Id": "req_smoke_account",
    },
  });
  const body = await res.json();

  if (res.status !== 200 || body.success !== true) {
    throw new Error("Smoke request failed");
  }

  await new Promise((resolve) => setTimeout(resolve, 250));
  const log = await ApiLog.findOne({
    merchant: merchant._id,
    requestId: "req_smoke_account",
  });

  if (!log) {
    throw new Error("Smoke request did not create an API log");
  }

  console.log("SMOKE_OK", {
    account: body.data.id,
    apiLog: log._id.toString(),
  });
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (merchant?._id) {
      await ApiLog.deleteMany({ merchant: merchant._id }).catch(() => {});
      await Transaction.deleteMany({ merchant: merchant._id }).catch(() => {});
      await ApiKey.deleteMany({ merchant: merchant._id }).catch(() => {});
      await Merchant.deleteOne({ _id: merchant._id, businessName: `Smoke Merchant ${runId}` }).catch(() => {});
    }
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
