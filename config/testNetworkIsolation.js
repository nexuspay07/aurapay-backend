const http = require("node:http");
const https = require("node:https");
let installed = false;
const originals = {};

function isLoopback(input) {
  const value = typeof input === "string" || input instanceof URL ? new URL(input) : new URL(`${input?.protocol || "http:"}//${input?.hostname || input?.host || ""}`);
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(value.hostname);
}

function installExternalNetworkTripwire() {
  if (installed) return;
  installed = true;
  for (const module of [http, https]) for (const method of ["request", "get"]) {
    const key = `${module === http ? "http" : "https"}.${method}`;
    originals[key] = module[method];
    module[method] = function guardedRequest(input, ...args) {
      if (!isLoopback(input)) throw new Error("External network access is blocked during AuraPay tests.");
      return originals[key].call(this, input, ...args);
    };
  }
  if (typeof globalThis.fetch === "function") {
    originals.fetch = globalThis.fetch;
    globalThis.fetch = function guardedFetch(input, ...args) {
      const target = typeof Request !== "undefined" && input instanceof Request ? input.url : input;
      if (!isLoopback(target)) throw new Error("External network access is blocked during AuraPay tests.");
      return originals.fetch.call(this, input, ...args);
    };
  }
}

module.exports = { installExternalNetworkTripwire };
