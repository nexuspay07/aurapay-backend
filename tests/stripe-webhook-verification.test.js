const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const Stripe = require("stripe");

const { installExternalNetworkTripwire } = require("../config/testNetworkIsolation");
const { SIGNATURE_TOLERANCE_SECONDS } = require("../services/stripeWebhookVerificationService");

installExternalNetworkTripwire();

const TEST_SECRET = "whsec_phase12btestsecret1234567890";
const ENDPOINT = "/api/provider-webhooks/stripe/test";
const originalEnvironment = {
  enabled: process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED,
  secret: process.env.STRIPE_TEST_WEBHOOK_SECRET,
};

process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED = "true";
process.env.STRIPE_TEST_WEBHOOK_SECRET = TEST_SECRET;

const app = require("../app");

let server;
let baseUrl;

function event(overrides = {}) {
  const { paymentIntent: paymentIntentOverrides, ...eventOverrides } = overrides;
  const paymentIntent = {
    id: "pi_phase12b_test",
    object: "payment_intent",
    livemode: false,
    amount: 100,
    currency: "usd",
    status: "succeeded",
    ...paymentIntentOverrides,
  };
  return {
    id: "evt_phase12b_test",
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    data: { object: paymentIntent },
    ...eventOverrides,
    data: eventOverrides.data || { object: paymentIntent },
  };
}

function signed(payload, { secret = TEST_SECRET, timestamp } = {}) {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    ...(timestamp === undefined ? {} : { timestamp }),
  });
}

async function post(payload, { signature, contentType = "application/json" } = {}) {
  const headers = { "Content-Type": contentType };
  if (signature !== undefined) headers["Stripe-Signature"] = signature;
  const response = await fetch(`${baseUrl}${ENDPOINT}`, {
    method: "POST",
    headers,
    body: payload,
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (originalEnvironment.enabled === undefined) delete process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED;
  else process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED = originalEnvironment.enabled;
  if (originalEnvironment.secret === undefined) delete process.env.STRIPE_TEST_WEBHOOK_SECRET;
  else process.env.STRIPE_TEST_WEBHOOK_SECRET = originalEnvironment.secret;
});

test("valid locally signed success and failure events use the raw-body route", async () => {
  for (const fixture of [
    event(),
    event({
      id: "evt_phase12b_failed",
      type: "payment_intent.payment_failed",
      paymentIntent: { id: "pi_phase12b_failed", status: "requires_payment_method" },
    }),
  ]) {
    const payload = JSON.stringify(fixture);
    const response = await post(payload, { signature: signed(payload) });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      data: {
        received: true,
        verified: true,
        livemode: false,
        type: fixture.type,
        processing: "not_started",
      },
    });
  }
});

test("missing, invalid, stale, and ambiguous signatures are rejected", async () => {
  const payload = JSON.stringify(event());
  assert.equal((await post(payload)).status, 400);
  assert.equal((await post(payload, { signature: "t=1,v1=invalid" })).status, 400);
  assert.equal((await post(payload, {
    signature: signed(payload, { timestamp: Math.floor(Date.now() / 1000) - SIGNATURE_TOLERANCE_SECONDS - 1 }),
  })).status, 400);

  const ambiguous = await new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}${ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Stripe-Signature": [signed(payload), signed(payload)],
      },
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    });
    request.on("error", reject);
    request.end(payload);
  });
  assert.equal(ambiguous.status, 400);
});

test("live mode, malformed shapes, and unsupported event types are rejected", async () => {
  const fixtures = [
    event({ livemode: true }),
    event({ paymentIntent: { livemode: true } }),
    event({ data: {} }),
    event({ type: "payment_intent.created", paymentIntent: { status: "requires_payment_method" } }),
    event({ paymentIntent: { amount: "100" } }),
    { id: "evt_invalid", object: "event", type: "payment_intent.succeeded", livemode: false },
  ];
  for (const fixture of fixtures) {
    const payload = JSON.stringify(fixture);
    assert.equal((await post(payload, { signature: signed(payload) })).status, 400);
  }

  const malformed = "{not-json";
  assert.equal((await post(malformed, { signature: signed(malformed) })).status, 400);
});

test("incorrect content types and oversized payloads are rejected", async () => {
  const payload = JSON.stringify(event());
  assert.equal((await post(payload, {
    signature: signed(payload),
    contentType: "text/plain",
  })).status, 415);

  const oversized = Buffer.alloc(256 * 1024 + 1, 97);
  const response = await fetch(`${baseUrl}${ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": "t=1,v1=not-evaluated",
    },
    body: oversized,
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "payload_too_large");
});

test("disabled and missing-secret configurations fail closed", async () => {
  const payload = JSON.stringify(event());
  const signature = signed(payload);

  process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED = "false";
  assert.equal((await post(payload, { signature })).status, 503);
  process.env.STRIPE_EXTERNAL_WEBHOOKS_ENABLED = "true";
  delete process.env.STRIPE_TEST_WEBHOOK_SECRET;
  assert.equal((await post(payload, { signature })).status, 503);
  process.env.STRIPE_TEST_WEBHOOK_SECRET = "whsec_short";
  assert.equal((await post(payload, { signature })).status, 503);
  process.env.STRIPE_TEST_WEBHOOK_SECRET = TEST_SECRET;
});

test("verification performs no persistence, outbound call, or legacy route activation", async () => {
  const mongoose = require("mongoose");
  const originalCreate = mongoose.Model.create;
  const originalUpdateOne = mongoose.Model.updateOne;
  const originalSave = mongoose.Model.prototype.save;
  let mutations = 0;
  mongoose.Model.create = async function blockedCreate() { mutations += 1; throw new Error("database mutation tripwire"); };
  mongoose.Model.updateOne = async function blockedUpdate() { mutations += 1; throw new Error("database mutation tripwire"); };
  mongoose.Model.prototype.save = async function blockedSave() { mutations += 1; throw new Error("database mutation tripwire"); };
  try {
    const payload = JSON.stringify(event({ id: "evt_phase12b_no_mutation" }));
    assert.equal((await post(payload, { signature: signed(payload) })).status, 200);
    assert.equal(mutations, 0);
  } finally {
    mongoose.Model.create = originalCreate;
    mongoose.Model.updateOne = originalUpdateOne;
    mongoose.Model.prototype.save = originalSave;
  }

  const legacy = await fetch(`${baseUrl}/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(legacy.status, 404);
});
