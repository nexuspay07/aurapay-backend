const https = require("node:https");
const net = require("node:net");

const {
  WebhookDestinationError,
  validateWebhookDestination,
} = require("./webhookDestinationValidator");

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

class WebhookTransportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WebhookTransportError";
    this.code = code;
  }
}

function createPinnedLookup(addresses) {
  const pinned = addresses.map((entry) => ({ ...entry }));

  return (hostname, options, callback) => {
    const requestedFamily = Number(options?.family) || 0;
    const candidates = requestedFamily
      ? pinned.filter((entry) => entry.family === requestedFamily)
      : pinned;

    if (!candidates.length) {
      const error = new Error("No validated address for requested family.");
      error.code = "ENOTFOUND";
      callback(error);
      return;
    }

    if (options?.all) {
      callback(null, candidates.map((entry) => ({ ...entry })));
      return;
    }

    callback(null, candidates[0].address, candidates[0].family);
  };
}

function createSafeWebhookHttpClient(dependencies = {}) {
  const lookup = dependencies.lookup;
  const request = dependencies.request || https.request;
  const timeoutMs = dependencies.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    dependencies.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES;

  return {
    async validate(url) {
      return validateWebhookDestination(url, { lookup });
    },

    async postJson(url, payload, headers = {}) {
      const destination = await validateWebhookDestination(url, { lookup });
      const body = JSON.stringify(payload);

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (handler, value) => {
          if (settled) return;
          settled = true;
          handler(value);
        };

        const requestOptions = {
          method: "POST",
          protocol: "https:",
          hostname: destination.hostname,
          port: destination.url.port || 443,
          path: `${destination.url.pathname}${destination.url.search}`,
          servername: net.isIP(destination.hostname)
            ? undefined
            : destination.hostname,
          lookup: createPinnedLookup(destination.addresses),
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...headers,
          },
          rejectUnauthorized: true,
        };

        const req = request(requestOptions, (response) => {
          let responseBytes = 0;
          response.on("data", (chunk) => {
            responseBytes += Buffer.byteLength(chunk);
            if (responseBytes > maxResponseBytes) {
              req.destroy();
              finish(
                reject,
                new WebhookTransportError(
                  "response_too_large",
                  "Webhook endpoint returned an oversized response."
                )
              );
            }
          });
          response.on("end", () => {
            finish(resolve, {
              statusCode: response.statusCode || null,
              delivered:
                response.statusCode >= 200 && response.statusCode < 300,
            });
          });
          response.on("error", () => {
            finish(
              reject,
              new WebhookTransportError(
                "delivery_failed",
                "Webhook endpoint could not be reached."
              )
            );
          });
        });

        req.setTimeout(timeoutMs, () => {
          req.destroy();
          finish(
            reject,
            new WebhookTransportError(
              "delivery_timeout",
              "Webhook endpoint timed out."
            )
          );
        });
        req.on("error", () => {
          finish(
            reject,
            new WebhookTransportError(
              "delivery_failed",
              "Webhook endpoint could not be reached."
            )
          );
        });
        req.end(body);
      });
    },
  };
}

const client = createSafeWebhookHttpClient();

module.exports = client;
module.exports.DEFAULT_MAX_RESPONSE_BYTES = DEFAULT_MAX_RESPONSE_BYTES;
module.exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
module.exports.WebhookDestinationError = WebhookDestinationError;
module.exports.WebhookTransportError = WebhookTransportError;
module.exports.createPinnedLookup = createPinnedLookup;
module.exports.createSafeWebhookHttpClient = createSafeWebhookHttpClient;
