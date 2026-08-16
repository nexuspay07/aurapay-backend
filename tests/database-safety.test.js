const assert = require("node:assert/strict");
const test = require("node:test");
const { parseMongoUri, validateTestDatabaseUri } = require("../config/testDatabaseSafety");
const { assertSafeDestructiveOperation } = require("./helpers/testDatabase");

test("rejects a missing or empty test URI", () => {
  assert.throws(() => validateTestDatabaseUri({ testUri: undefined }), /required/);
  assert.throws(() => validateTestDatabaseUri({ testUri: "  " }), /required/);
});
test("rejects malformed and non-MongoDB URIs", () => {
  assert.throws(() => parseMongoUri("not a uri"), /valid MongoDB URI/);
  assert.throws(() => parseMongoUri("https://localhost/aurapay_test"), /valid MongoDB URI|must use mongodb/);
});
test("rejects missing, ordinary, and production-looking database names", () => {
  assert.throws(() => parseMongoUri("mongodb://localhost"), /explicitly name/);
  assert.throws(() => parseMongoUri("mongodb://localhost/aurapay"), /unsafe test database/);
  assert.throws(() => parseMongoUri("mongodb://localhost/production"), /unsafe test database/);
});
test("rejects a test URI equivalent to the normal URI even with different credentials", () => {
  assert.throws(() => validateTestDatabaseUri({ testUri: "mongodb://test:secret@LOCALHOST:27017/aurapay_test?retryWrites=false", normalUri: "mongodb://normal:secret@localhost:27017/aurapay_test?retryWrites=false" }), /must not identify the same database/);
});
test("accepts explicit dedicated test and e2e database names", () => {
  assert.equal(validateTestDatabaseUri({ testUri: "mongodb://localhost:27017/aurapay_test" }).databaseName, "aurapay_test");
  assert.equal(validateTestDatabaseUri({ testUri: "mongodb+srv://u:p@example.invalid/aurapay-e2e" }).databaseName, "aurapay-e2e");
});

test("accepts replica-set host lists and rejects same DB despite option differences", () => {
  assert.equal(validateTestDatabaseUri({ testUri: "mongodb://db1:27017,db2:27017/aurapay_test?replicaSet=test-rs" }).databaseName, "aurapay_test");
  assert.throws(() => validateTestDatabaseUri({
    testUri: "mongodb://u:p@db1:27017,db2:27017/aurapay_test?replicaSet=test-rs",
    normalUri: "mongodb://db2:27017,db1:27017/aurapay_test?readPreference=secondary",
  }), /must not identify the same database/);
});

test("destructive operations require test context and a verified live connection", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTestUri = process.env.MONGO_URI_TEST;
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI_TEST = "mongodb://localhost:27017/aurapay_test";
  try { assert.throws(() => assertSafeDestructiveOperation(), /verified test connection/); }
  finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousTestUri === undefined) delete process.env.MONGO_URI_TEST; else process.env.MONGO_URI_TEST = previousTestUri;
  }
});
