const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

async function cleanup(seedPath) {
  const seed = require(path.resolve(seedPath));
  const model = (name) => require(`../models/${name}`);
  await mongoose.connect(process.env.MONGO_URI_TEST || process.env.MONGO_URI);
  try {
    await Promise.all([
      ...["ApiLog", "ApiKey", "Application", "CheckoutSession", "Event", "MerchantWebhook", "Settlement", "Transaction", "WebhookDelivery"].map((name) => model(name).deleteMany({ merchant: seed.merchantId })),
      model("FraudLog").deleteMany({ $or: [{ merchant: seed.merchantId }, { user: seed.userId }] }),
      model("AuditLog").deleteMany({ $or: [{ targetId: seed.merchantId }, { targetId: seed.userId }, { admin: seed.userId }] }),
      model("User").deleteMany({ _id: seed.userId, merchantId: seed.merchantId }),
    ]);
    await model("Merchant").deleteOne({ _id: seed.merchantId, contactEmail: seed.email });
  } finally { await mongoose.disconnect(); }
}

cleanup(process.argv[2]).then(() => console.log("E2E_SCOPED_CLEANUP_OK")).catch((error) => { console.error(error.message); process.exitCode = 1; });
