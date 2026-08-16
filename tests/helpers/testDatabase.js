const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { assertVerifiedConnection, validateTestDatabaseUri } = require("../../config/testDatabaseSafety");

let verifiedDatabaseName = null;
const runId = (process.env.AURAPAY_TEST_RUN_ID || `run-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`).replace(/[^a-zA-Z0-9_-]/g, "-");

function requireTestContext() {
  if (process.env.NODE_ENV !== "test") throw new Error("Database-backed tests require NODE_ENV=test.");
  return validateTestDatabaseUri();
}

async function connectTestDatabase() {
  const verified = requireTestContext();
  if (mongoose.connection.readyState && mongoose.connection.name !== verified.databaseName) throw new Error("Mongoose is already connected to a different database; refusing test startup.");
  if (mongoose.connection.readyState === 0) await mongoose.connect(verified.uri);
  assertVerifiedConnection(mongoose, verified.databaseName);
  verifiedDatabaseName = verified.databaseName;
  console.log(`TEST DATABASE VERIFIED\nDatabase name: ${verified.databaseName}\nRun ID: ${runId}`);
  return mongoose.connection;
}

function assertSafeDestructiveOperation() {
  const verified = requireTestContext();
  if (verifiedDatabaseName !== verified.databaseName) throw new Error("Destructive test operation requires a verified test connection.");
  return assertVerifiedConnection(mongoose, verified.databaseName);
}

async function disconnectTestDatabase() {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  verifiedDatabaseName = null;
}

module.exports = { assertSafeDestructiveOperation, connectTestDatabase, disconnectTestDatabase, runId };
