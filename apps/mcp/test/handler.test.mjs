import test from "node:test";
import assert from "node:assert/strict";
import { handleMcpRequest, tools } from "../src/handler.mjs";
import { previewClientMetadataResponse } from "../src/preview-metadata.mjs";

const apiKey = "sk_live_test_key_never_use_in_production_123";
const props = {
  provider: "syrianfatora",
  grantSubject: "grant-test-001",
  upstreamApiKey: apiKey,
};

function rpc(method, params = {}, id = 1) {
  const headers = { "Content-Type": "application/json" };
  if (method !== "initialize") headers["MCP-Protocol-Version"] = "2025-03-26";
  return new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

async function json(response) {
  return response.json();
}


test("validates tool arguments against the published inputSchema", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list", arguments: { query: { per_page: 101 } },
  }), props, { checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async () => { called = true; return Response.json({}); } });
  const body = await json(response);
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /per_page exceeds the maximum/);
  assert.equal(called, false);
});

test("rejects undeclared top-level tool arguments", async () => {
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_get", arguments: { id: "cust-1", unexpected: true },
  }), props);
  assert.match((await json(response)).result.content[0].text, /unsupported property: unexpected/);
});

test("forwards only the documented customer filters", async () => {
  let observed;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list", arguments: { query: { per_page: 10, search: "Acme" } },
  }), props, { checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async (url) => { observed = url; return Response.json({ data: [] }); } });
  assert.equal(new URL(observed).searchParams.get("search"), "Acme");
  assert.equal(new URL(observed).searchParams.get("per_page"), "10");
  assert.equal((await json(response)).result.isError, false);
});

test("uses the 2025-03-26 compatibility default when older clients omit the protocol header", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const response = await handleMcpRequest(request, props);
  assert.equal(response.status, 200);
  assert.equal((await json(response)).result.tools.length, 51);
});

test("rejects unsupported MCP protocol versions", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST", headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2099-01-01" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }),
  });
  assert.equal((await handleMcpRequest(request, props)).status, 400);
});

test("rejects disallowed Origin before parsing MCP requests", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { Origin: "https://evil.example", "MCP-Protocol-Version": "2025-03-26" },
    body: "{invalid",
  });
  const response = await handleMcpRequest(request, props, { allowedOrigins: "https://chat.example" });
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Forbidden origin.");
});

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
  assert.equal(body.result.serverInfo.version, "1.2.0");
});


test("production hides Preview client metadata while the isolated Preview Worker retains it", async () => {
  const url = new URL("https://syrianfatora-mcp.example.test/oauth/client-metadata.json");

  const production = previewClientMetadataResponse(url, { IS_PREVIEW: "false" });
  assert.equal(production.status, 404);
  assert.equal(production.headers.get("Cache-Control"), "no-store");

  const missingBinding = previewClientMetadataResponse(url, {});
  assert.equal(missingBinding.status, 404);

  const preview = previewClientMetadataResponse(url, { IS_PREVIEW: "true" });
  assert.equal(preview.status, 200);
  const metadata = await preview.json();
  assert.equal(metadata.client_id, url.href);
  assert.equal(metadata.client_name, "SyrianFatora Preview E2E Client");
  assert.deepEqual(metadata.redirect_uris, ["https://example.com/oauth/callback"]);
});

test("MCP initialize can report a Preview-only version without leaking it into Production", async () => {
  const production = await handleMcpRequest(rpc("initialize", { protocolVersion: "2025-03-26" }), props);
  const preview = await handleMcpRequest(rpc("initialize", { protocolVersion: "2025-03-26" }), props, {
    serverVersion: "1.2.0-oauth-preview",
  });

  assert.equal((await production.json()).result.serverInfo.version, "1.2.0");
  assert.equal((await preview.json()).result.serverInfo.version, "1.2.0-oauth-preview");
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
    arguments: { query: { page: 2, per_page: 10, search: "Acme" } },
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
  assert.equal(new URL(observed.url).searchParams.get("search"), "Acme");
  assert.equal(body.result.isError, false);
  assert.equal(body.result.content[0].text.includes(apiKey), false);
});

test("write operations are denied without mcp:write before any upstream request", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "invoices_create",
    arguments: { body: {
      customer_id: 42, status: "draft", invoice_date: "2026-06-29",
      currency: "SYP", language: "ar", discount_type: "fixed",
      tax_mode: "invoice", items: [{ title: "Consulting", qty: 1, unit_price: 100, discount_type: "fixed" }],
    } },
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
    arguments: { body: {
      customer_id: 42, status: "draft", invoice_date: "2026-06-29",
      currency: "SYP", language: "ar", discount_type: "fixed",
      tax_mode: "invoice", items: [{ title: "Consulting", qty: 1, unit_price: 100, discount_type: "fixed" }],
    } },
  }), props, {
    requireWriteScope: () => null,
    checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return Response.json({ id: "invoice-1" }, { status: 201 });
    },
  });
  const body = await json(response);

  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.headers.Authorization, `Bearer ${apiKey}`);
  assert.deepEqual(JSON.parse(observed.options.body), {
    customer_id: 42, status: "draft", invoice_date: "2026-06-29",
    currency: "SYP", language: "ar", discount_type: "fixed",
    tax_mode: "invoice", items: [{ title: "Consulting", qty: 1, unit_price: 100, discount_type: "fixed" }],
  });
  assert.equal(body.result.isError, false);
});

test("payment void requires the exact documented void_reason field", async () => {
  let called = false;
  const missing = await handleMcpRequest(rpc("tools/call", {
    name: "payments_delete", arguments: { id: "payment-1", reason: "legacy field" },
  }), props, { requireWriteScope: () => null,
    fetchImpl: async () => { called = true; return Response.json({}); } });
  assert.match((await json(missing)).result.content[0].text, /void_reason is required/);
  assert.equal(called, false);
});

test("payment void maps void_reason to the exact REST DELETE body", async () => {
  let observed;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "payments_delete", arguments: { id: "payment-1", void_reason: "Recorded by mistake" },
  }), props, {
    requireWriteScope: () => null,
    checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return Response.json({ message: "Payment voided." });
    },
  });
  assert.equal(observed.options.method, "DELETE");
  assert.deepEqual(JSON.parse(observed.options.body), { void_reason: "Recorded by mistake" });
  assert.equal(new URL(observed.url).pathname, "/api/public/v1/payments/payment-1");
  assert.equal((await json(response)).result.isError, false);
});

test("publishes strict REST query and body schemas from the developer reference", () => {
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(Object.keys(byName.customers_list.inputSchema.properties.query.properties).sort(),
    ["page", "per_page", "search"]);
  assert.equal(byName.payment_methods_list.inputSchema.properties.query, undefined);
  assert.deepEqual(byName.items_create.inputSchema.properties.body.required,
    ["name", "type", "default_unit_price"]);
  assert.equal(byName.items_create.inputSchema.properties.body.additionalProperties, false);
  assert.deepEqual(byName.payments_delete.inputSchema.required, ["id", "void_reason"]);
  assert.equal(byName.payments_delete.inputSchema.properties.void_reason.maxLength, undefined);
});

test("rejects undocumented filters and unsupported body fields before upstream access", async () => {
  let called = false;
  const options = { checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async () => { called = true; return Response.json({}); } };
  const filter = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list", arguments: { query: { status: "active" } },
  }), props, options);
  assert.match((await json(filter)).result.content[0].text, /unsupported property: status/);
  const body = await handleMcpRequest(rpc("tools/call", {
    name: "items_create", arguments: { body: {
      name: "Service", type: "service", default_unit_price: 10, total: 10,
    } },
  }), props, options);
  assert.match((await json(body)).result.content[0].text, /unsupported property: total/);
  assert.equal(called, false);
});

test("validates documented numeric bounds, enums, and calendar dates", async () => {
  const invalidQty = await handleMcpRequest(rpc("tools/call", {
    name: "invoices_create", arguments: { body: {
      customer_id: 1, status: "draft", invoice_date: "2026-02-30", currency: "SYP",
      language: "ar", discount_type: "fixed", tax_mode: "invoice",
      items: [{ title: "Line", qty: 0, unit_price: 1, discount_type: "fixed" }],
    } },
  }), props);
  assert.match((await json(invalidQty)).result.content[0].text, /valid YYYY-MM-DD date/);
});

test("enforces documented quote and recurring-schedule date ordering", async () => {
  let called = false;
  const options = { checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async () => { called = true; return Response.json({}); } };
  const quote = await handleMcpRequest(rpc("tools/call", {
    name: "quotes_create", arguments: { body: {
      customer_id: 1, status: "draft", quote_date: "2026-06-30", valid_until: "2026-06-29",
      currency: "SYP", language: "ar", discount_type: "fixed", tax_mode: "invoice",
      items: [{ title: "Line", qty: 1, unit_price: 1, discount_type: "fixed" }],
    } },
  }), props, options);
  assert.match((await json(quote)).result.content[0].text, /valid_until must be on or after/);

  const recurring = await handleMcpRequest(rpc("tools/call", {
    name: "recurring_invoices_create", arguments: { body: {
      customer_id: 1, currency: "SYP", language: "ar", frequency: "monthly",
      interval_count: 1, start_date: "2026-07-01", next_run_date: "2026-07-01",
      end_date: "2026-06-30", discount_type: "fixed", tax_mode: "invoice",
      items: [{ title: "Line", qty: 1, unit_price: 1, discount_type: "fixed" }],
    } },
  }), props, options);
  assert.match((await json(recurring)).result.content[0].text, /end_date must be on or after/);
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
    checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async () => Response.json({ debug: apiKey }),
  });
  const text = (await json(response)).result.content[0].text;

  assert.equal(text.includes(apiKey), false);
  assert.equal(text.includes("[REDACTED]"), true);
});

test("bounds JSON request bodies even without a content-length header", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-03-26" },
    body: "x".repeat(128),
  });
  const response = await handleMcpRequest(request, props, { maxRequestBytes: 32 });

  assert.equal(response.status, 413);
  assert.equal((await json(response)).error.code, -32600);
});

test("rejects malformed JSON-RPC payloads", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-03-26" },
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
    checkUpstreamCooldown: async () => ({ allowed: true }),
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
    checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async () => { throw new Error(`request failed: ${apiKey}`); },
  });
  const body = await json(response);

  assert.equal(body.result.isError, true);
  assert.equal(body.result.content[0].text.includes(apiKey), false);
  assert.equal(body.result.content[0].text, "SyrianFatora API request failed. Please retry later.");
});


test("reports sanitized upstream transport diagnostics without exposing exception messages", async () => {
  let diagnostic;
  const secretMessage = `socket failed while sending ${apiKey} to a private URL`;
  const transportError = new TypeError(secretMessage, {
    cause: Object.assign(new Error(secretMessage), { code: "ECONNRESET" }),
  });
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: {},
  }), props, {
    checkUpstreamCooldown: async () => ({ allowed: true }),
    onUpstreamFailure: (event) => { diagnostic = event; },
    fetchImpl: async () => { throw transportError; },
  });
  const body = await json(response);

  assert.equal(body.result.isError, true);
  assert.equal(body.result.content[0].text, "SyrianFatora API request failed. Please retry later.");
  assert.deepEqual(diagnostic, {
    event: "mcp.upstream_failure",
    tool: "customers_list",
    phase: "fetch",
    errorName: "TypeError",
    errorMessageKind: "network_error",
    errorCode: undefined,
    causeName: "Error",
    causeCode: "ECONNRESET",
    timeoutMs: 10_000,
    durationMs: diagnostic.durationMs,
  });
  assert.equal(JSON.stringify(diagnostic).includes(apiKey), false);
  assert.equal(JSON.stringify(diagnostic).includes("private URL"), false);
});

test("classifies generic fetch failures without exposing exception text", async () => {
  let diagnostic;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list", arguments: {},
  }), props, {
    checkUpstreamCooldown: async () => ({ allowed: true }),
    onUpstreamFailure: (event) => { diagnostic = event; },
    fetchImpl: async () => { throw new TypeError("fetch failed: private query=secret"); },
  });
  assert.equal((await json(response)).result.isError, true);
  assert.equal(diagnostic.errorMessageKind, "unknown");
  assert.equal(JSON.stringify(diagnostic).includes("private query"), false);
});

test("uses manual redirects for one-hop upstream diagnosis and logs only safe redirect metadata", async () => {
  let observedOptions;
  let redirectDiagnostic;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list", arguments: {},
  }), props, {
    checkUpstreamCooldown: async () => ({ allowed: true }),
    onUpstreamRedirect: (event) => { redirectDiagnostic = event; },
    fetchImpl: async (_url, options) => {
      observedOptions = options;
      return new Response(null, {
        status: 302,
        headers: { Location: "https://www.syrianfatora.com/login?token=private" },
      });
    },
  });
  const body = await json(response);
  assert.equal(observedOptions.redirect, "manual");
  assert.equal(body.result.isError, true);
  assert.equal(JSON.parse(body.result.content[0].text).status, 302);
  assert.deepEqual(redirectDiagnostic, {
    event: "mcp.upstream_redirect",
    tool: "customers_list",
    status: 302,
    locationHost: "www.syrianfatora.com",
  });
  assert.equal(JSON.stringify(redirectDiagnostic).includes("private"), false);
});

test("fails closed when no upstream cooldown guard is provided", async () => {
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
    checkUpstreamCooldown: async () => ({ allowed: true }),
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


test("validates tool arguments against the published input schema", async () => {
  let called = false;
  const response = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: { query: { per_page: 0 } },
  }), props, {
    checkUpstreamCooldown: async () => ({ allowed: true }),
    fetchImpl: async () => { called = true; return Response.json({}); },
  });
  const body = await json(response);

  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /per_page is below the minimum/);
  assert.equal(called, false);
});

test("rejects undeclared top-level tool arguments and invalid body types", async () => {
  const extra = await handleMcpRequest(rpc("tools/call", {
    name: "customers_list",
    arguments: { query: {}, unexpected: true },
  }), props);
  assert.match((await json(extra)).result.content[0].text, /unsupported property: unexpected/);

  const invalidBody = await handleMcpRequest(rpc("tools/call", {
    name: "invoices_create",
    arguments: { body: [] },
  }), props, { requireWriteScope: () => null });
  assert.match((await json(invalidBody)).result.content[0].text, /body must be object/);
});

test("falls back to the latest supported legacy protocol when initialize requests an unknown version", async () => {
  const response = await handleMcpRequest(rpc("initialize", {
    protocolVersion: "2026-07-28",
  }), props);
  assert.equal(response.status, 200);
  assert.equal((await json(response)).result.protocolVersion, "2025-11-25");
});

test("rejects unsupported MCP-Protocol-Version headers on subsequent requests", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2030-01-01",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping", params: {} }),
  });
  const response = await handleMcpRequest(request, props);
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error.code, -32600);
});

test("accepts a supported MCP-Protocol-Version header after initialization", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2024-11-05",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "ping", params: {} }),
  });
  const response = await handleMcpRequest(request, props);
  assert.equal(response.status, 200);
  assert.deepEqual((await json(response)).result, {});
});

test("accepts the 2025-11-25 protocol-version header", async () => {
  const request = new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 11, method: "ping", params: {} }),
  });
  const response = await handleMcpRequest(request, props);
  assert.equal(response.status, 200);
  assert.deepEqual((await json(response)).result, {});
});
