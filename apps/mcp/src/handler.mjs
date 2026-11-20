import { validateToolArguments } from "./input-validation.mjs";
import { isAllowedMcpOrigin } from "./origin-validation.mjs";

const BASE = "https://syrianfatora.com/api/public/v1";
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-03-26", "2024-11-05"];

const RESOURCES = {
  customers: ["list", "get", "create"],
  invoices: ["list", "get", "create"],
  items: ["list", "get", "create", "update", "delete"],
  quotes: ["list", "get", "create", "update", "delete"],
  "credit-notes": ["list", "get", "create", "update", "delete"],
  payments: ["list", "get", "create", "delete"],
  "payment-methods": ["list"],
  "recurring-invoices": ["list", "get", "create", "update", "delete"],
  expenses: ["list", "get", "create", "update", "delete"],
  suppliers: ["list", "get", "create", "update", "delete"],
  "expense-categories": ["list", "get", "create", "update", "delete"],
  "exchange-rates": ["list", "get", "create", "update", "delete"],
};

const GUIDANCE = {
  customers: "Customer records. Use only documented SyrianFatora customer fields.",
  invoices: "Sales invoices. Supply customer and line-item details (quantities, unit prices and applicable tax data). Never send calculated totals; SyrianFatora calculates invoice totals.",
  items: "Products or services. Use exact documented item fields and decimal strings for monetary values.",
  quotes: "Sales quotations. Supply line-item details; do not send calculated totals.",
  "credit-notes": "Credit notes. Use documented invoice/customer references and line-item details.",
  payments: "Payment records. Use documented invoice/customer reference, amount, currency and payment-method fields.",
  "payment-methods": "Available payment methods. Read-only lookup.",
  "recurring-invoices": "Recurring invoice schedules. Use documented schedule and line-item fields; do not send calculated totals.",
  expenses: "Business expenses. Use documented supplier/category references, date, description and amount fields.",
  suppliers: "Supplier records. Use only documented SyrianFatora supplier fields.",
  "expense-categories": "Expense category records. Use only documented category fields.",
  "exchange-rates": "Exchange-rate records. Preserve currency codes and decimal precision exactly as documented.",
};

function describe(resource, action) {
  const base = GUIDANCE[resource] || resource;
  if (action === "list") return `List ${resource} records. Supports documented filters and pagination (page, per_page; per_page 1–100). ${base}`;
  if (action === "get") return `Retrieve one ${resource} record by its ID. ${base}`;
  if (action === "create") return (resource === "payments" ? "Record a payment. " : `Create a ${resource} record. `) + base;
  if (action === "update") return `Update a ${resource} record by ID. ${base}`;
  if (resource === "payments") return "Void a payment by ID. This is a soft delete and requires a reason; it does not erase payment history.";
  return `Delete a ${resource} record by ID. This operation changes live workspace data.`;
}

export const tools = [];
for (const [resource, actions] of Object.entries(RESOURCES)) {
  for (const action of actions) {
    const properties = {};
    const required = [];
    if (["get", "update", "delete"].includes(action)) {
      properties.id = { type: "string", minLength: 1, description: "Record ID returned by SyrianFatora." };
      required.push("id");
    }
    if (action === "list") {
      properties.query = {
        type: "object",
        description: "Optional documented filters. Pagination: page >= 1; per_page is 1–100 (default 25).",
        properties: {
          page: { type: "integer", minimum: 1 },
          per_page: { type: "integer", minimum: 1, maximum: 100 },
        },
        additionalProperties: true,
      };
    }
    if (["create", "update"].includes(action)) {
      properties.body = {
        type: "object",
        description: "JSON request body using exact SyrianFatora API field names. Do not include server-calculated invoice, quote or recurring-invoice totals.",
        additionalProperties: true,
      };
      required.push("body");
    }
    if (resource === "payments" && action === "delete") {
      properties.reason = {
        type: "string",
        minLength: 3,
        maxLength: 500,
        description: "Required reason for voiding this payment.",
      };
      required.push("reason");
    }
    tools.push({
      name: `${resource.replace(/-/g, "_")}_${action}`,
      description: describe(resource, action),
      inputSchema: { type: "object", properties, required, additionalProperties: false },
    });
  }
}

function reply(id, result) {
  return Response.json({ jsonrpc: "2.0", id, result }, {
    headers: { "Cache-Control": "no-store" },
  });
}

function rpcError(id, code, message, status = 400, extraHeaders = {}) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, String(value));
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers });
}

function toolError(id, message) {
  return reply(id, {
    content: [{ type: "text", text: message }],
    isError: true,
  });
}

function safeDiagnosticValue(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value);
  return /^[A-Za-z0-9_.-]{1,64}$/.test(normalized) ? normalized : undefined;
}

function classifyFetchErrorMessage(message) {
  if (typeof message !== "string") return "unknown";
  if (/^fetch failed$/i.test(message.trim())) return "fetch_failed";
  if (/redirect/i.test(message)) return "redirect_error";
  if (/invalid url|failed to parse url/i.test(message)) return "invalid_url";
  if (/dns|socket|network|connection|tls|certificate/i.test(message)) return "network_error";
  return "unknown";
}

function safeRedirectHost(location, requestUrl) {
  if (typeof location !== "string" || !location) return undefined;
  try {
    const host = new URL(location, requestUrl).hostname.toLowerCase();
    return /^[a-z0-9.-]{1,253}$/.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

async function readBoundedBody(stream, maxBytes) {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      const error = new Error("Request body too large");
      error.code = "body_too_large";
      throw error;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function readJsonRequest(request, maxBytes) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    const error = new Error("Request body too large");
    error.code = "body_too_large";
    throw error;
  }
  const raw = await readBoundedBody(request.body, maxBytes);
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON");
    error.code = "invalid_json";
    throw error;
  }
}

function getToolParts(name) {
  const split = name.lastIndexOf("_");
  if (split <= 0) return null;
  const action = name.slice(split + 1);
  if (!["list", "get", "create", "update", "delete"].includes(action)) return null;
  return { action, resource: name.slice(0, split).replace(/_/g, "-") };
}

export async function handleMcpRequest(request, props, {
  fetchImpl = fetch,
  requireWriteScope = () => true,
  serverVersion = "1.2.0",
  checkUpstreamCooldown,
  onUpstreamRateLimited,
  onUpstreamFailure,
  onUpstreamRedirect,
  maxRequestBytes = 1_048_576,
  upstreamTimeoutMs = 10_000,
  allowedOrigins = "",
} = {}) {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
  if (!isAllowedMcpOrigin(request, { MCP_ALLOWED_ORIGINS: allowedOrigins })) {
    return new Response("Forbidden origin.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (request.method === "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" },
    });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" },
    });
  }

  const apiKey = props?.provider === "syrianfatora" ? props.upstreamApiKey : null;
  if (typeof apiKey !== "string" || apiKey.length < 20 || apiKey.length > 512) {
    return new Response("Authorization grant is missing a valid upstream credential.", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let message;
  try {
    message = await readJsonRequest(request, maxRequestBytes);
  } catch (error) {
    if (error.code === "body_too_large") return rpcError(null, -32600, "Request body is too large.", 413);
    return rpcError(null, -32700, "Parse error: request body must be valid JSON.", 400);
  }

  if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message && message.id !== undefined ? message.id : null, -32600, "Invalid JSON-RPC request.");
  }

  const id = message.id === undefined ? null : message.id;
  if (message.method !== "initialize") {
    const protocolVersion = request.headers.get("MCP-Protocol-Version") ?? "2025-03-26";
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
      return rpcError(id, -32600, "Unsupported MCP-Protocol-Version. Supported versions: 2025-11-25, 2025-03-26, 2024-11-05.", 400);
    }
  }
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  if (message.method === "initialize") {
    const requested = message.params && message.params.protocolVersion;
    const negotiatedVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : SUPPORTED_PROTOCOL_VERSIONS[0];
    return reply(id, {
      protocolVersion: negotiatedVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "syrianfatora-mcp", version: serverVersion },
    });
  }
  if (message.method === "ping") return reply(id, {});
  if (message.method === "tools/list") return reply(id, { tools });
  if (message.method !== "tools/call") {
    return rpcError(id, -32601, `Method not found: ${message.method}`, 404);
  }

  const name = message.params && message.params.name;
  const tool = tools.find((item) => item.name === name);
  if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(name)}`);

  const parts = getToolParts(tool.name);
  if (!parts) return rpcError(id, -32602, "Invalid tool definition.");
  const { action, resource } = parts;

  if (["create", "update", "delete"].includes(action)) {
    const denied = requireWriteScope();
    if (denied instanceof Response) return denied;
    if (denied === false) {
      return new Response("Insufficient scope.", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const args = message.params && message.params.arguments !== undefined
    ? message.params.arguments
    : {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return toolError(id, "Tool arguments must be a JSON object.");
  }
  const validationError = validateToolArguments(tool, args);
  if (validationError) return toolError(id, `Invalid tool arguments: ${validationError}`);

  const method = action === "list" || action === "get"
    ? "GET"
    : action === "create" ? "POST" : action === "update" ? "PUT" : "DELETE";

  let path = `/${resource}`;
  if (["get", "update", "delete"].includes(action)) {
    if (typeof args.id !== "string" || !args.id.trim() || args.id.length > 200) {
      return toolError(id, "A valid record ID is required.");
    }
    path += `/${encodeURIComponent(args.id.trim())}`;
  }

  const target = new URL(BASE + path);
  if (action === "list" && args.query !== undefined) {
    if (!args.query || typeof args.query !== "object" || Array.isArray(args.query)) {
      return toolError(id, "The query argument must be a JSON object.");
    }
    if (args.query.per_page !== undefined &&
      (!Number.isInteger(args.query.per_page) || args.query.per_page < 1 || args.query.per_page > 100)) {
      return toolError(id, "per_page must be an integer from 1 to 100.");
    }
    if (args.query.page !== undefined && (!Number.isInteger(args.query.page) || args.query.page < 1)) {
      return toolError(id, "page must be a positive integer.");
    }
    for (const [key, value] of Object.entries(args.query)) {
      if (!/^[a-zA-Z0-9_]+$/.test(key)) return toolError(id, `Invalid query parameter name: ${key}`);
      if (value === null || value === undefined) continue;
      if (!["string", "number", "boolean"].includes(typeof value)) {
        return toolError(id, `Query parameter values must be strings, numbers or booleans: ${key}`);
      }
      target.searchParams.set(key, String(value));
    }
  }

  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  let body;
  if (action === "create" || action === "update") {
    if (!args.body || typeof args.body !== "object" || Array.isArray(args.body)) {
      return toolError(id, "A JSON object body is required.");
    }
    body = JSON.stringify(args.body);
    headers["Content-Type"] = "application/json";
  } else if (resource === "payments" && action === "delete") {
    if (typeof args.reason !== "string" || args.reason.trim().length < 3 || args.reason.length > 500) {
      return toolError(id, "A void reason of 3–500 characters is required.");
    }
    body = JSON.stringify({ reason: args.reason.trim() });
    headers["Content-Type"] = "application/json";
  }

  if (typeof checkUpstreamCooldown !== "function") {
    return rpcError(id, -32000, "Upstream requests are temporarily unavailable.", 503);
  }

  try {
    const decision = await checkUpstreamCooldown();
    if (!decision?.allowed) {
      const retryAfter = Math.max(1, Number(decision?.retryAfterSeconds) || 1);
      return rpcError(id, -32029, "SyrianFatora has temporarily asked this workspace to wait. Retry later.", 429, {
        "Retry-After": retryAfter,
      });
    }
  } catch {
    return rpcError(id, -32000, "SyrianFatora cooldown status is temporarily unavailable.", 503);
  }

  let upstreamFailurePhase = "fetch";
  const upstreamStartedAt = Date.now();
  try {
    if (!Number.isSafeInteger(upstreamTimeoutMs) || upstreamTimeoutMs <= 0) {
      return rpcError(id, -32000, "Upstream request timeout is not configured safely.", 503);
    }
    const signal = typeof AbortSignal?.timeout === "function"
      ? AbortSignal.timeout(upstreamTimeoutMs)
      : undefined;
    if (!signal) {
      return rpcError(id, -32000, "Upstream request timeout is unavailable in this runtime.", 503);
    }
    const upstream = await fetchImpl(target.toString(), {
      method,
      headers,
      redirect: "manual",
      signal,
      ...(body !== undefined ? { body } : {}),
    });
    upstreamFailurePhase = "read_response_body";
    if (upstream.status >= 300 && upstream.status < 400) {
      try {
        if (typeof onUpstreamRedirect === "function") {
          onUpstreamRedirect({
            event: "mcp.upstream_redirect",
            tool: tool.name,
            status: upstream.status,
            locationHost: safeRedirectHost(upstream.headers.get("Location"), target),
          });
        }
      } catch {
        // Redirect diagnostics must never change the upstream response.
      }
    }
    if (upstream.status === 429) {
      if (typeof onUpstreamRateLimited !== "function") {
        return rpcError(id, -32000, "SyrianFatora rate-limited this workspace; cooldown could not be recorded.", 503);
      }
      try {
        await onUpstreamRateLimited(upstream.headers.get("Retry-After"));
      } catch {
        return rpcError(id, -32000, "SyrianFatora rate-limited this workspace; cooldown could not be recorded.", 503);
      }
    }

    const raw = await readBoundedBody(upstream.body, 1_048_576);
    const safeRaw = raw.replaceAll(apiKey, "[REDACTED]");
    let data;
    try {
      data = safeRaw ? JSON.parse(safeRaw) : null;
    } catch {
      data = { raw: safeRaw.slice(0, 3000) };
    }
    return reply(id, {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: upstream.status,
          data,
          rateLimit: {
            limit: upstream.headers.get("X-RateLimit-Limit"),
            remaining: upstream.headers.get("X-RateLimit-Remaining"),
            retryAfter: upstream.headers.get("Retry-After"),
          },
        }),
      }],
      isError: !upstream.ok,
    });
  } catch (error) {
    const cause = error && typeof error === "object" ? error.cause : undefined;
    const diagnostic = {
      event: "mcp.upstream_failure",
      tool: tool.name,
      phase: upstreamFailurePhase,
      errorName: safeDiagnosticValue(error?.name),
      errorMessageKind: classifyFetchErrorMessage(error?.message),
      errorCode: safeDiagnosticValue(error?.code),
      causeName: safeDiagnosticValue(cause?.name),
      causeCode: safeDiagnosticValue(cause?.code),
      timeoutMs: upstreamTimeoutMs,
      durationMs: Math.max(0, Date.now() - upstreamStartedAt),
    };
    try {
      if (typeof onUpstreamFailure === "function") onUpstreamFailure(diagnostic);
    } catch {
      // Diagnostics must never change the upstream error response.
    }
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return toolError(id, "SyrianFatora API request timed out. Please retry later.");
    }
    return toolError(id, "SyrianFatora API request failed. Please retry later.");
  }
}
