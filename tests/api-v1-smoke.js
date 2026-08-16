const http = require("http");
const mongoose = require("mongoose");
const { assertSafeDestructiveOperation, connectTestDatabase, disconnectTestDatabase } = require("./helpers/testDatabase");
const { installExternalNetworkTripwire } = require("./helpers/networkIsolation");

const app = require("../app");
const ApiLog = require("../models/ApiLog");
const ApiKey = require("../models/ApiKey");
const Merchant = require("../models/Merchant");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const apiKeyService = require("../services/apiKeyService");
const { createSandboxApiKey, createVerifiedMerchantAccount } = require("./helpers/merchantFixtures");

async function main() {
  const runId = `smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let merchant = null;
  let owner = null;
  let server = null;
  try {
  installExternalNetworkTripwire();
  await connectTestDatabase();

  ({ merchant, owner } = await createVerifiedMerchantAccount({ merchant: {
    businessName: `Smoke Merchant ${runId}`,
    legalName: `Smoke Merchant ${runId} LLC`,
  } }));

  const key = await createSandboxApiKey(merchant, {
    name: "Smoke key",
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
      assertSafeDestructiveOperation();
      await ApiLog.deleteMany({ merchant: merchant._id }).catch(() => {});
      await Transaction.deleteMany({ merchant: merchant._id }).catch(() => {});
      await ApiKey.deleteMany({ merchant: merchant._id }).catch(() => {});
      if (owner?._id) await User.deleteOne({ _id: owner._id, merchantId: merchant._id }).catch(() => {});
      await Merchant.deleteOne({ _id: merchant._id, businessName: `Smoke Merchant ${runId}` }).catch(() => {});
    }
    await disconnectTestDatabase().catch(() => {});
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await disconnectTestDatabase().catch(() => {});
  process.exit(1);
});
