const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const { installExternalNetworkTripwire } = require("../config/testNetworkIsolation");

test("test network tripwire rejects external HTTP and fetch before I/O", () => {
  installExternalNetworkTripwire();
  assert.throws(() => http.request("http://api.stripe.com/v1/test"), /External network access is blocked/);
  assert.throws(() => fetch("https://merchant.example/webhook"), /External network access is blocked/);
});
