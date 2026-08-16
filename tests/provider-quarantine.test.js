const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const app = require("../app");

const quarantinedRoutes = [
  ["POST", "/stripe/create-payment-intent"],
  ["POST", "/api/stripe/create-payment-intent"],
  ["POST", "/stripe/webhook"],
  ["POST", "/paypal-checkout/create-order"],
  ["POST", "/api/paypal-checkout/create-order"],
  ["POST", "/paypal-checkout/capture-order"],
  ["POST", "/api/paypal-checkout/capture-order"],
  ["POST", "/payments/pay"],
  ["POST", "/api/payments/pay"],
  ["POST", "/payment-completion/complete/test-session"],
  ["POST", "/api/payment-completion/complete/test-session"],
  ["GET", "/payments/intelligence"],
  ["GET", "/api/payments/intelligence"],
  ["GET", "/payments/test"],
  ["GET", "/api/payments/test"],
  ["GET", "/test"],
  ["POST", "/test"],
];

const providerModules = [
  "routes/stripeWebhookRoutes.js",
  "routes/stripeRoutes.js",
  "routes/paypalCheckoutRoutes.js",
  "routes/paymentRoutes.js",
  "routes/paymentCompletionRoutes.js",
  "services/stripeService.js",
  "services/paypalService.js",
  "services/providerRefundService.js",
].map((file) => path.normalize(path.resolve(__dirname, "..", file)));

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("public beta does not initialize provider or legacy payment modules", () => {
  const loadedModules = new Set(Object.keys(require.cache).map(path.normalize));

  for (const providerModule of providerModules) {
    assert.equal(
      loadedModules.has(providerModule),
      false,
      `${path.relative(process.cwd(), providerModule)} must not be initialized`
    );
  }
});

test("health remains public", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, status: "ok" });
});

test("sandbox API remains mounted and requires an API key", async () => {
  const response = await fetch(`${baseUrl}/api/v1`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
});

for (const [method, route] of quarantinedRoutes) {
  test(`${method} ${route} returns 404 without provider execution`, async () => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : {},
      body: method === "POST" ? "{}" : undefined,
    });

    assert.equal(response.status, 404);
  });
}
