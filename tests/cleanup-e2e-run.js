const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const { assertSafeDestructiveOperation, connectTestDatabase, disconnectTestDatabase } = require("./helpers/testDatabase");

async function cleanup(seedPath) {
  if (!seedPath) throw new Error("A specific E2E seed file path is required.");
  const seed = require(path.resolve(seedPath));
  if (!seed.runId || !/^[a-zA-Z0-9_-]{6,}$/.test(seed.runId)) throw new Error("Cleanup requires a specific non-wildcard runId in the seed file.");
  if (!seed.merchantId || !seed.userId) throw new Error("Cleanup requires exact merchantId and userId values.");
  const model = (name) => require(`../models/${name}`);
  await connectTestDatabase();
  try {
    assertSafeDestructiveOperation();
    console.log(`Cleaning exact records for run ID: ${seed.runId}`);
    await Promise.all([
      ...["ApiLog", "ApiKey", "Application", "CheckoutSession", "Event", "MerchantWebhook", "Settlement", "Transaction", "WebhookDelivery"].map((name) => model(name).deleteMany({ merchant: seed.merchantId })),
      model("FraudLog").deleteMany({ $or: [{ merchant: seed.merchantId }, { user: seed.userId }] }),
      model("AuditLog").deleteMany({ $or: [{ targetId: seed.merchantId }, { targetId: seed.userId }, { admin: seed.userId }] }),
      model("User").deleteMany({ _id: seed.userId, merchantId: seed.merchantId }),
    ]);
    await model("Merchant").deleteOne({ _id: seed.merchantId, contactEmail: seed.email });
  } finally { await disconnectTestDatabase(); }
}

cleanup(process.argv[2]).then(() => console.log("E2E_SCOPED_CLEANUP_OK")).catch((error) => { console.error(error.message); process.exitCode = 1; });
