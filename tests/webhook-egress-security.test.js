const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  WebhookDestinationError,
  isPublicAddress,
  validateWebhookDestination,
} = require("../services/webhookDestinationValidator");
const {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_TIMEOUT_MS,
  createSafeWebhookHttpClient,
} = require("../services/safeWebhookHttpClient");
const merchantWebhookService = require("../services/merchantWebhookService");
const MerchantWebhook = require("../models/MerchantWebhook");

const maliciousUrls = [
  "http://example.com",
  "ftp://example.com",
  "file:///etc/passwd",
  "data:text/plain,hello",
  "javascript:alert(1)",
  "ws://example.com",
  "wss://example.com",
  "https://localhost",
  "https://localhost./",
  "https://sub.localhost/",
  "https://metadata/",
  "https://metadata.google.internal/",
  "https://service.internal/",
  "https://127.0.0.1/",
  "https://127.1/",
  "https://0.0.0.0/",
  "https://10.0.0.1/",
  "https://172.16.0.1/",
  "https://192.168.1.1/",
  "https://169.254.169.254/",
  "https://100.64.0.1/",
  "https://192.0.2.1/",
  "https://198.51.100.1/",
  "https://203.0.113.1/",
  "https://[::1]/",
  "https://[fc00::1]/",
  "https://[fe80::1]/",
  "https://[ff00::1]/",
  "https://[2001:db8::1]/",
  "https://[::ffff:127.0.0.1]/",
  "https://[::ffff:10.0.0.1]/",
  "https://[::ffff:169.254.169.254]/",
  "https://user:pass@example.com/webhook",
  "not a url",
];

test("unsafe webhook URLs fail closed without DNS or network access", async () => {
  let dnsAttempts = 0;
  let networkAttempts = 0;
  const client = createSafeWebhookHttpClient({
    lookup: async () => {
      dnsAttempts += 1;
      throw new Error("DNS tripwire");
    },
    request: () => {
      networkAttempts += 1;
      throw new Error("Network tripwire");
    },
  });

  for (const url of maliciousUrls) {
    await assert.rejects(client.postJson(url, { test: true }), (error) => {
      assert.equal(error instanceof WebhookDestinationError, true, url);
      return true;
    });
  }

  assert.equal(dnsAttempts, 0);
  assert.equal(networkAttempts, 0);
});

test("IPv4 and IPv6 public-address classification blocks reserved ranges", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("127.0.0.1"), false);
  assert.equal(isPublicAddress("169.254.169.254"), false);
  assert.equal(isPublicAddress("::1"), false);
  assert.equal(isPublicAddress("::192.168.1.1"), false);
  assert.equal(isPublicAddress("fec0::1"), false);
  assert.equal(isPublicAddress("::ffff:7f00:1"), false);
});

test("DNS permits only all-public answer sets", async () => {
  const cases = [
    [[{ address: "8.8.8.8", family: 4 }], true],
    [[{ address: "2606:4700:4700::1111", family: 6 }], true],
    [[{ address: "10.0.0.1", family: 4 }], false],
    [[{ address: "fc00::1", family: 6 }], false],
    [[
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ], false],
  ];

  for (const [addresses, allowed] of cases) {
    const operation = validateWebhookDestination("https://hooks.example.com/a", {
      lookup: async () => addresses,
    });
    if (allowed) {
      assert.equal((await operation).addresses.length, addresses.length);
    } else {
      await assert.rejects(operation, WebhookDestinationError);
    }
  }

  await assert.rejects(
    validateWebhookDestination("https://hooks.example.com/a", {
      lookup: async () => {
        throw new Error("NXDOMAIN");
      },
    }),
    WebhookDestinationError
  );
});

function mockRequest(statusCode, responseChunks = []) {
  const calls = [];
  const request = (options, callback) => {
    const req = new EventEmitter();
    req.destroy = () => {};
    req.setTimeout = (milliseconds, handler) => {
      req.timeoutMs = milliseconds;
      req.timeoutHandler = handler;
    };
    req.end = (body) => {
      calls.push({ options, body, req });
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = statusCode;
        callback(response);
        for (const chunk of responseChunks) response.emit("data", chunk);
        response.emit("end");
      });
    };
    return req;
  };
  return { calls, request };
}

test("transport pins validated DNS answers and preserves TLS hostname", async () => {
  let resolverCalls = 0;
  const mock = mockRequest(204);
  const client = createSafeWebhookHttpClient({
    lookup: async () => {
      resolverCalls += 1;
      return resolverCalls === 1
        ? [{ address: "8.8.8.8", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    },
    request: mock.request,
  });

  const result = await client.postJson(
    "https://hooks.example.com/events",
    { id: "evt_test" }
  );
  assert.equal(result.delivered, true);
  assert.equal(resolverCalls, 1);
  assert.equal(mock.calls[0].options.hostname, "hooks.example.com");
  assert.equal(mock.calls[0].options.servername, "hooks.example.com");
  assert.equal(mock.calls[0].options.rejectUnauthorized, true);

  const pinned = await new Promise((resolve, reject) => {
    mock.calls[0].options.lookup("hooks.example.com", {}, (error, address) =>
      error ? reject(error) : resolve(address)
    );
  });
  assert.equal(pinned, "8.8.8.8");
  assert.equal(resolverCalls, 1);
});

test("redirect responses are not followed", async () => {
  const mock = mockRequest(302);
  const client = createSafeWebhookHttpClient({
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: mock.request,
  });
  const result = await client.postJson("https://hooks.example.com", {});
  assert.equal(result.delivered, false);
  assert.equal(result.statusCode, 302);
  assert.equal(mock.calls.length, 1);
});

test("transport applies bounded timeout and response size", async () => {
  const mock = mockRequest(200, [Buffer.alloc(DEFAULT_MAX_RESPONSE_BYTES + 1)]);
  const client = createSafeWebhookHttpClient({
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    request: mock.request,
  });
  await assert.rejects(
    client.postJson("https://hooks.example.com", {}),
    (error) => error.code === "response_too_large"
  );
  assert.equal(mock.calls[0].req.timeoutMs, DEFAULT_TIMEOUT_MS);
});

test("canonical delivery signs the exact JSON payload", async () => {
  const payload = { id: "evt_test", type: "payment.completed" };
  const first = merchantWebhookService.createSignature("whsec_test", payload);
  const second = merchantWebhookService.createSignature("whsec_test", payload);
  assert.equal(first, second);
  assert.equal(first.length, 64);

  const safeClient = require("../services/safeWebhookHttpClient");
  const original = safeClient.postJson;
  let captured;
  safeClient.postJson = async (url, body, headers) => {
    captured = { url, body, headers };
    return { statusCode: 204, delivered: true };
  };
  try {
    const result = await merchantWebhookService.attemptDelivery(
      { url: "https://hooks.example.com", secret: "whsec_test" },
      payload,
      "payment.completed"
    );
    assert.equal(result.status, "delivered");
    assert.deepEqual(captured.body, payload);
    assert.equal(captured.headers["X-AuraPay-Signature"], first);
    assert.equal(captured.headers["X-AuraPay-Event"], "payment.completed");
  } finally {
    safeClient.postJson = original;
  }
});

test("webhook signing secrets are excluded from queries by default", () => {
  assert.equal(MerchantWebhook.schema.path("secret").options.select, false);
});
