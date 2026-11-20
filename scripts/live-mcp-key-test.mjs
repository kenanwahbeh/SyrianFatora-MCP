#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = process.env.DOTENV_PATH ?? path.join(ROOT, ".env");
const AUTH_ORIGIN = new URL(process.env.AUTH_ORIGIN ?? "https://syrianfatora-auth.kinan-api.workers.dev").origin;
const MCP_ORIGIN = new URL(process.env.MCP_ORIGIN ?? "https://syrianfatora-mcp.kinan-api.workers.dev").origin;
const MCP_RESOURCE = `${MCP_ORIGIN}/mcp`;
const CACHE_PATH = process.env.SMOKE_CLIENT_CACHE
  ?? path.join(homedir(), ".syrianfatora-live-test", "client.json");
const PROTOCOL = "2025-03-26";

function parseEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(KEY_[123])\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) values.set(match[1], value);
  }
  return values;
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function jsonResponse(response, label) {
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch {
    throw new Error(`${label}: expected JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const reason = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new Error(`${label}: ${String(reason).slice(0, 120)}`);
  }
  return data;
}

async function getClient(redirectUri) {
  try {
    const cached = JSON.parse(await readFile(CACHE_PATH, "utf8"));
    if (cached.redirect_uri === redirectUri && typeof cached.client_id === "string") {
      return cached.client_id;
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }

  const response = await fetch(`${AUTH_ORIGIN}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "SyrianFatora controlled live MCP test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const client = await jsonResponse(response, "OAuth client registration");
  assert.equal(typeof client.client_id, "string");
  await mkdir(path.dirname(CACHE_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CACHE_PATH, JSON.stringify({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    registeredAt: Date.now(),
  }) + "\n", { mode: 0o600 });
  await chmod(CACHE_PATH, 0o600);
  return client.client_id;
}

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function authorizeKey({ label, apiKey, clientId, redirectUri, scopes }) {
  const state = b64url(randomBytes(32));
  const verifier = b64url(randomBytes(32));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorizeUrl = new URL(`${AUTH_ORIGIN}/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP_RESOURCE,
  }).toString();

  const consentPage = await fetch(authorizeUrl, {
    headers: { Accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  if (consentPage.status !== 200) {
    throw new Error(`${label}: OAuth consent page returned HTTP ${consentPage.status}`);
  }
  const html = await consentPage.text();
  const handleMatch = html.match(/<input\s+type="hidden"\s+name="handle"\s+value="([^"]+)"/i);
  if (!handleMatch) throw new Error(`${label}: consent transaction handle was not present`);
  const handle = handleMatch[1];
  const cookies = cookieHeader(consentPage);
  if (!cookies) throw new Error(`${label}: consent session cookie was not issued`);

  const form = new URLSearchParams();
  form.set("handle", handle);
  form.set("api_key", apiKey);
  form.set("decision", "approve");
  for (const scope of scopes) form.append("scope", scope);

  const approved = await fetch(`${AUTH_ORIGIN}/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
      Cookie: cookies,
    },
    body: form,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (approved.status !== 302) {
    throw new Error(`${label}: OAuth consent was not completed (HTTP ${approved.status})`);
  }

  const callback = new URL(approved.headers.get("location") ?? "");
  if (callback.origin !== new URL(redirectUri).origin || callback.pathname !== new URL(redirectUri).pathname) {
    throw new Error(`${label}: OAuth redirect did not match the registered loopback callback`);
  }
  if (callback.searchParams.get("state") !== state) throw new Error(`${label}: OAuth state validation failed`);
  const code = callback.searchParams.get("code");
  if (!code) throw new Error(`${label}: authorization code was not returned`);

  const tokenResponse = await fetch(`${AUTH_ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: MCP_RESOURCE,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const tokens = await jsonResponse(tokenResponse, `${label} token exchange`);
  assert.equal(typeof tokens.access_token, "string");
  assert.match(String(tokens.token_type), /^bearer$/i);
  assert.ok(Number(tokens.expires_in) > 0);
  if (scopes.includes("offline_access")) assert.equal(typeof tokens.refresh_token, "string");
  return tokens;
}

async function mcpRequest(method, params, token, id, sessionId) {
  const response = await fetch(MCP_RESOURCE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
      ...(sessionId ? { "MCP-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  if (response.status !== 200) throw new Error(`MCP ${method}: HTTP ${response.status}`);
  let message;
  try { message = JSON.parse(raw); } catch { throw new Error(`MCP ${method}: non-JSON response`); }
  if (message.error) throw new Error(`MCP ${method}: JSON-RPC ${message.error.code}`);
  assert.equal(message.jsonrpc, "2.0");
  assert.equal(message.id, id);
  return { message, sessionId: response.headers.get("MCP-Session-Id") ?? sessionId };
}

async function mcpNotify(method, token, sessionId) {
  const response = await fetch(MCP_RESOURCE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
      ...(sessionId ? { "MCP-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method }),
    signal: AbortSignal.timeout(15000),
  });
  if (![200, 202, 204].includes(response.status)) {
    throw new Error(`MCP notification ${method}: HTTP ${response.status}`);
  }
}

async function createMcpSession(token) {
  const initialized = await mcpRequest("initialize", {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "syrianfatora-controlled-live-test", version: "1.0.0" },
  }, token, 1);
  assert.equal(initialized.message.result?.serverInfo?.name, "syrianfatora-mcp");
  await mcpNotify("notifications/initialized", token, initialized.sessionId);
  const listed = await mcpRequest("tools/list", {}, token, 2, initialized.sessionId);
  const tools = listed.message.result?.tools;
  assert.ok(Array.isArray(tools));
  assert.equal(tools.length, 51);
  return { tools, sessionId: listed.sessionId };
}

async function callTool(name, args, token, sessionId, id) {
  const called = await mcpRequest("tools/call", { name, arguments: args }, token, id, sessionId);
  const result = called.message.result;
  if (!result) throw new Error(`MCP tool ${name} returned no result`);
  const text = (result.content ?? []).find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error(`MCP tool ${name} returned no text result`);
  let payload;
  try { payload = JSON.parse(text); } catch {
    const safeMessage = /^(Invalid tool arguments: [A-Za-z0-9 _.,-]{1,120}|SyrianFatora API request (?:timed out|failed)\. Please retry later\.|A JSON object body is required\.|A valid record ID is required\.)$/.test(text)
      ? text
      : "non-JSON tool error";
    throw new Error(`MCP tool ${name} failed: ${safeMessage}`);
  }
  if (Number(payload.status) < 200 || Number(payload.status) >= 300) {
    throw new Error(`MCP tool ${name} upstream HTTP ${payload.status}`);
  }
  if (result.isError !== false) throw new Error(`MCP tool ${name} returned an upstream error`);
  return payload;
}

async function revokeGrant(refreshToken, clientId, label) {
  const discoveryResponse = await fetch(`${AUTH_ORIGIN}/.well-known/oauth-authorization-server`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const discovery = await jsonResponse(discoveryResponse, "OAuth discovery");
  if (!discovery.revocation_endpoint) throw new Error(`${label}: OAuth revocation endpoint is not advertised`);
  const response = await fetch(discovery.revocation_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: clientId,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (![200, 204].includes(response.status)) {
    throw new Error(`${label}: OAuth grant cleanup failed (HTTP ${response.status})`);
  }
}

async function runReadOnly(label, apiKey, clientId, redirectUri) {
  const scopes = ["mcp:read", "offline_access"];
  let tokens;
  try {
    tokens = await authorizeKey({ label, apiKey, clientId, redirectUri, scopes });
    const session = await createMcpSession(tokens.access_token);
    assert.ok(session.tools.some((tool) => tool.name === "customers_list"));
    await callTool("customers_list", { query: { per_page: 1 } }, tokens.access_token, session.sessionId, 3);
    console.log(`${label}: PASS — OAuth, MCP initialize, tools/list (51), customers_list.`);
  } finally {
    if (tokens?.refresh_token) await revokeGrant(tokens.refresh_token, clientId, label);
  }
}

async function runWriteTest(label, apiKey, clientId, redirectUri) {
  const scopes = ["mcp:read", "mcp:write", "offline_access"];
  let tokens;
  let session;
  let createdId;
  let primaryError;
  const marker = `MCP-LIVE-TEST-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomUUID().slice(0, 8)}`;
  const code = marker.replace(/[^A-Z0-9-]/g, "").slice(0, 48);
  const originalBody = {
    name: marker,
    type: "service",
    code,
    description: "Temporary record created only for the SyrianFatora MCP live integration test.",
    default_unit_price: 1,
    tax_rate: 0,
    unit: "test",
    is_active: true,
  };

  try {
    tokens = await authorizeKey({ label, apiKey, clientId, redirectUri, scopes });
    session = await createMcpSession(tokens.access_token);
    assert.ok(session.tools.some((tool) => tool.name === "items_create"));
    assert.ok(session.tools.some((tool) => tool.name === "items_update"));
    assert.ok(session.tools.some((tool) => tool.name === "items_delete"));
    await callTool("items_list", { query: { search: code, per_page: 10 } }, tokens.access_token, session.sessionId, 3);

    const created = await callTool("items_create", { body: originalBody }, tokens.access_token, session.sessionId, 4);
    createdId = created.data?.id ?? created.data?.data?.id;
    if (createdId === undefined || createdId === null) {
      throw new Error("items_create succeeded but returned no record ID; automatic cleanup cannot safely continue");
    }

    const updatedBody = {
      ...originalBody,
      description: "Updated temporary MCP live-test record; safe to delete after verification.",
      default_unit_price: 2,
    };
    await callTool("items_update", { id: String(createdId), body: updatedBody }, tokens.access_token, session.sessionId, 5);
    const fetched = await callTool("items_get", { id: String(createdId) }, tokens.access_token, session.sessionId, 6);
    const record = fetched.data?.data ?? fetched.data;
    assert.equal(String(record?.id), String(createdId));
    assert.equal(record?.description, updatedBody.description);

    await callTool("items_delete", { id: String(createdId) }, tokens.access_token, session.sessionId, 7);
    createdId = undefined;
    const afterDelete = await callTool("items_list", { query: { search: code, per_page: 10 } }, tokens.access_token, session.sessionId, 8);
    const rows = afterDelete.data?.data ?? afterDelete.data ?? [];
    assert.ok(Array.isArray(rows));
    assert.equal(rows.some((row) => row.code === code), false);
    console.log(`${label}: PASS — OAuth read/write scopes, item create/update/get/delete, cleanup verified.`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (createdId !== undefined && tokens?.access_token && session?.sessionId) {
      try {
        await callTool("items_delete", { id: String(createdId) }, tokens.access_token, session.sessionId, 90);
        console.log(`${label}: cleanup — removed only the item created by this test.`);
      } catch {
        console.error(`${label}: WARNING — test-created item cleanup failed; its ID is intentionally withheld from output.`);
      }
    }
    if (tokens?.refresh_token) {
      try { await revokeGrant(tokens.refresh_token, clientId, label); }
      catch (error) {
        console.error(`${label}: WARNING — OAuth grant cleanup failed: ${error.message}`);
        if (!primaryError) throw error;
      }
    }
  }
}

async function main() {
  const envText = await readFile(ENV_PATH, "utf8");
  const keys = parseEnv(envText);
  for (const name of ["KEY_1", "KEY_2", "KEY_3"]) {
    if (!keys.has(name)) throw new Error(`${name} is missing or empty in the local .env file`);
  }

  const callbackPort = Number(process.env.SMOKE_CALLBACK_PORT ?? 43127);
  assert.ok(Number.isInteger(callbackPort) && callbackPort > 0 && callbackPort <= 65535);
  const redirectUri = `http://127.0.0.1:${callbackPort}/callback`;
  const clientId = await getClient(redirectUri);

  console.log("SyrianFatora live MCP test — credential values and customer data are never printed.");
  console.log("KEY_1 and KEY_2: read-only; KEY_3: isolated item write lifecycle.");
  await runReadOnly("KEY_1", keys.get("KEY_1"), clientId, redirectUri);
  await runReadOnly("KEY_2", keys.get("KEY_2"), clientId, redirectUri);
  await runWriteTest("KEY_3", keys.get("KEY_3"), clientId, redirectUri);
  console.log("ALL TESTS PASSED.");
}

main().catch((error) => {
  console.error(`LIVE TEST FAILED: ${String(error?.message ?? "unexpected failure").slice(0, 200)}`);
  process.exitCode = 1;
});
