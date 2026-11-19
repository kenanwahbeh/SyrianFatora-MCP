import test from "node:test";
import assert from "node:assert/strict";
import { handleMcpRequest, tools } from "../src/handler.mjs";

const apiKey = "sk_live_test_key_never_use_in_production_123";
const props = {
  provider: "syrianfatora",
  grantSubject: "grant-test-001",
  upstreamApiKey: apiKey,
};

function rpc(method, params = {}, id = 1) {
  return new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

async function json(response) {
  return response.json();
}

test("preserves the complete 51-tool catalogue", () => {
  assert.equal(tools.length, 51);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 51);
  assert.ok(tools.some((tool) => tool.name === "customers_list"));
  assert.ok(tools.some((tool) => tool.name === "credit_notes_delete"));
  assert.ok(tools.some((tool) => tool.name === "payment_methods_list"));
});

test("initialize returns the negotiated MCP protocol version", async () => {
  const response = await handleMcpRequest(rpc("initialize", {
    protocolVersion: "2025-03-26",
  }), props);
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.result.protocolVersion, "2025-03-26");
  assert.equal(body.result.serverInfo.name, "syrianfatora-mcp");
});

test("tools/list returns all existing tools without calling the upstream API", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/list"), props, {
    fetchImpl: async () => { called = true; throw new Error("unexpected fetch"); },
  });
  const body = await json(response);

  assert.equal(body.result.tools.length, 51);
  assert.equal(called, false);
});

test("rejects missing or malformed encrypted grant properties", async () => {
  const response = await handleMcpRequest(rpc("tools/list"), {
    provider: "other",
    upstreamApiKey: apiKey,
  });
  assert.equal(response.status, 500);
});

test("read-only customer listing forwards the grant key only upstream", async () => {
  let observed;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: { query: { page: 2, per_page: 10, active: true } },
  }), props, {
    checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return Response.json({ data: [{ id: "customer-1" }] }, {
        headers: { "X-RateLimit-Remaining": "8" },
      });
    },
  });
  const body = await json(response);

  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(new URL(observed.url).pathname, "/api/public/v1/customers");
  assert.equal(new URL(observed.url).searchParams.get("per_page"), "10");
  assert.equal(body.result.isError, false);
  assert.equal(body.result.content[0].text.includes(apiKey), false);
});

test("write operations are denied without mcp:write before any upstream request", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "invoices_create",
    arguments: { body: { customer_id: "c-1" } },
  }), props, {
    requireWriteScope: () => new Response("insufficient_scope", { status: 403 }),
    fetchImpl: async () => { called = true; throw new Error("must not be called"); },
  });

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("write operations are allowed when mcp:write is granted", async () => {
  let observed;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "invoices_create",
    arguments: { body: { customer_id: "c-1" } },
  }), props, {
    requireWriteScope: () => null,
    rateLimit: async () => ({ allowed: true }),
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return Response.json({ id: "invoice-1" }, { status: 201 });
    },
  });
  const body = await json(response);

  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.headers.Authorization, `Bearer ${apiKey}`);
  assert.deepEqual(JSON.parse(observed.options.body), { customer_id: "c-1" });
  assert.equal(body.result.isError, false);
});

test("payment void still requires a reason", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "payments_delete",
    arguments: { id: "payment-1", reason: " " },
  }), props, {
    requireWriteScope: () => null,
    fetchImpl: async () => { called = true; return Response.json({}); },
  });
  const body = await json(response);

  assert.equal(body.result.isError, true);
  assert.equal(body.result.content[0].text, "A void reason of 3–500 characters is required.");
  assert.equal(called, false);
});

test("rejects unknown tools without calling the upstream API", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "admin_delete_all",
    arguments: {},
  }), props, {
    fetchImpl: async () => { called = true; return Response.json({}); },
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("redacts the upstream API key if the upstream response echoes it", async () => {
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: {},
  }), props, {
    rateLimit: async () => ({ allowed: true }),
    fetchImpl: async () => Response.json({ debug: apiKey }),
  });
  const text = (await json(response)).result.content[0].text;

  assert.equal(text.includes(apiKey), false);
  assert.equal(text.includes("[REDACTED]"), true);
});

test("bounds JSON request bodies even without a content-length header", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(128),
  });
  const response = await handleMcpRequest(request, props, { maxRequestBytes: 32 });

  assert.equal(response.status, 413);
  assert.equal((await json(response)).error.code, -32600);
});

test("rejects malformed JSON-RPC payloads", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  const response = await handleMcpRequest(request, props);

  assert.equal(response.status, 400);
  assert.equal((await json(response)).error.code, -32700);
});

test("aborts slow upstream requests after the configured timeout", async () => {
  let observedSignal;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: {},
  }), props, {
    rateLimit: async () => ({ allowed: true }),
    upstreamTimeoutMs: 20,
    fetchImpl: async (_url, options) => {
      observedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(options.signal.reason);
          return;
        }
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      });
    },
  });
  const body = await json(response);

  assert.ok(observedSignal instanceof AbortSignal);
  assert.equal(observedSignal.aborted, true);
  assert.equal(body.result.isError, true);
  assert.equal(body.result.content[0].text, "SyrianFatora API request timed out. Please retry later.");
});

test("does not reveal upstream fetch exceptions or credentials", async () => {
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: {},
  }), props, {
    rateLimit: async () => ({ allowed: true }),
    fetchImpl: async () => { throw new Error(`request failed: ${apiKey}`); },
  });
  const body = await json(response);

  assert.equal(body.result.isError, true);
  assert.equal(body.result.content[0].text.includes(apiKey), false);
  assert.equal(body.result.content[0].text, "SyrianFatora API request failed. Please retry later.");
});


test("fails closed when no rate limiter is provided", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: {},
  }), props, {
    fetchImpl: async () => { called = true; return Response.json({}); },
  });

  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test("blocks upstream calls only while SyrianFatora Retry-After cooldown is active", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: {},
  }), props, {
    checkUpstreamCooldown: async () => ({ allowed: false, retryAfterSeconds: 23, reason: "upstream_cooldown" }),
    fetchImpl: async () => { called = true; return Response.json({}); },
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "23");
  assert.match((await response.clone().json()).error.message, /SyrianFatora has temporarily asked/);
  assert.equal(called, false);
});

test("records the provider Retry-After when upstream returns 429", async () => {
  let recorded;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: {},
  }), props, {
    rateLimit: async () => ({ allowed: true }),
    onUpstreamRateLimited: async (value) => { recorded = value; },
    fetchImpl: async () => Response.json(
      { message: "rate limited" },
      { status: 429, headers: { "Retry-After": "12" } },
    ),
  });
  const body = await json(response);

  assert.equal(recorded, "12");
  assert.equal(body.result.isError, true);
  assert.equal(JSON.parse(body.result.content[0].text).status, 429);
});
