const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const test = require("node:test");
const { normalizePublicBaseUrl } = require("../services/emailService");

const approvedOrigin = "https://preview.aurapay.example";
const unapprovedOrigin = "https://unapproved.example";
const arbitraryVercelOrigin = "https://arbitrary-project.vercel.app";

process.env.AURAPAY_PREVIEW_ORIGIN = approvedOrigin;

const app = require("../app");

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("health permits an explicitly approved origin with credentials", async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { Origin: approvedOrigin },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), approvedOrigin);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.deepEqual(await response.json(), { success: true, status: "ok" });
});

test("health rejects an unapproved origin without permissive CORS headers", async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { Origin: unapprovedOrigin },
  });

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("authenticated merchant API preflight uses the approved CORS policy", async () => {
  const response = await fetch(`${baseUrl}/api/merchant/developer/metadata`, {
    method: "OPTIONS",
    headers: {
      Origin: approvedOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), approvedOrigin);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("access-control-allow-methods"), /GET/);
  assert.equal(response.headers.get("access-control-allow-headers"), "authorization");
});

test("arbitrary Vercel origin is rejected without permissive CORS headers", async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { Origin: arbitraryVercelOrigin },
  });

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("unset preview origin adds no preview allowance", async () => {
  const corsModulePath = require.resolve("../config/cors");
  const configuredPreviewOrigin = process.env.AURAPAY_PREVIEW_ORIGIN;
  let isolatedServer;

  try {
    delete process.env.AURAPAY_PREVIEW_ORIGIN;
    delete require.cache[corsModulePath];

    const isolatedApp = express();
    isolatedApp.use(require("../config/cors"));
    isolatedApp.get("/health", (req, res) => res.json({ status: "ok" }));
    isolatedApp.use((err, req, res, next) => res.status(500).json({ error: "rejected" }));

    isolatedServer = http.createServer(isolatedApp);
    await new Promise((resolve) => isolatedServer.listen(0, "127.0.0.1", resolve));
    const address = isolatedServer.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { Origin: approvedOrigin },
    });

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  } finally {
    if (isolatedServer) {
      await new Promise((resolve, reject) =>
        isolatedServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
    process.env.AURAPAY_PREVIEW_ORIGIN = configuredPreviewOrigin;
    delete require.cache[corsModulePath];
    require("../config/cors");
  }
});

test("preview CORS origin does not change email-link destinations", () => {
  const emailOrigin = "https://accounts.aurapay.example";

  assert.equal(
    normalizePublicBaseUrl({
      NODE_ENV: "production",
      AURAPAY_PREVIEW_ORIGIN: approvedOrigin,
      AURAPAY_FRONTEND_URL: emailOrigin,
    }),
    emailOrigin
  );
});
