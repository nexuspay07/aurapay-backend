const TEST_DATABASE_NAME = /(?:^|[_-])(test|testing|e2e)(?:$|[_-])/i;
const FORBIDDEN_DATABASE_NAME = /^(?:aurapay|admin|config|local|main|prod|production|development|dev)$/i;
const ConnectionString = require("mongodb-connection-string-url").default;

function parseMongoUri(uri, label = "MONGO_URI_TEST") {
  if (typeof uri !== "string" || !uri.trim()) throw new Error(`${label} is required; automated tests never fall back to MONGO_URI.`);
  let parsed;
  try { parsed = new ConnectionString(uri.trim()); } catch { throw new Error(`${label} must be a valid MongoDB URI.`); }
  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) throw new Error(`${label} must use mongodb:// or mongodb+srv://.`);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim();
  if (!databaseName || databaseName.includes("/")) throw new Error(`${label} must explicitly name one dedicated test database.`);
  if (FORBIDDEN_DATABASE_NAME.test(databaseName) || !TEST_DATABASE_NAME.test(databaseName)) {
    throw new Error(`Refusing unsafe test database name "${databaseName}"; include a distinct test or e2e segment.`);
  }
  return { parsed, databaseName };
}

function normalizedIdentity(uri) {
  const parsed = new ConnectionString(uri.trim());
  const hosts = [...parsed.hosts].map((host) => host.toLowerCase()).sort().join(",");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).toLowerCase();
  return `${parsed.protocol}//${hosts}/${databaseName}`;
}

function validateTestDatabaseUri({ testUri = process.env.MONGO_URI_TEST, normalUri = process.env.MONGO_URI } = {}) {
  const { databaseName } = parseMongoUri(testUri);
  if (typeof normalUri === "string" && normalUri.trim()) {
    try {
      if (normalizedIdentity(testUri) === normalizedIdentity(normalUri)) throw new Error("MONGO_URI_TEST must not identify the same database as MONGO_URI.");
    } catch (error) {
      if (error.message.includes("must not identify")) throw error;
    }
  }
  return { uri: testUri.trim(), databaseName };
}

function assertVerifiedConnection(mongoose, expectedDatabaseName) {
  const actual = mongoose?.connection?.name;
  if (!actual || actual !== expectedDatabaseName || !TEST_DATABASE_NAME.test(actual) || FORBIDDEN_DATABASE_NAME.test(actual)) {
    throw new Error(`Connected database identity is not the verified test database (expected "${expectedDatabaseName}").`);
  }
  return true;
}

module.exports = { assertVerifiedConnection, parseMongoUri, validateTestDatabaseUri };
