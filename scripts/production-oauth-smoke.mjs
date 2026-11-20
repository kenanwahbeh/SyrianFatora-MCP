#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const AUTH_ORIGIN = new URL(process.env.AUTH_ORIGIN ?? "https://syrianfatora-auth.kinan-api.workers.dev").origin;
const MCP_ORIGIN = new URL(process.env.MCP_ORIGIN ?? "https://syrianfatora-mcp.kinan-api.workers.dev").origin;
const MCP_RESOURCE = `${MCP_ORIGIN}/mcp`;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const CALLBACK_PORT = Number(process.env.SMOKE_CALLBACK_PORT ?? 43127);
const CLIENT_CACHE_PATH = process.env.SMOKE_CLIENT_CACHE
  ?? path.join(homedir(), ".syrianfatora-smoke", "client.json");
const CLIENT_CACHE_MAX_AGE_MS = 80 * 24 * 60 * 60 * 1000;

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function safeFailure() {
  console.error("\nSmoke test failed. Check local diagnostics for details.");
  process.exitCode = 1;
}

async function readJson(response, label) {
  const text = await response.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label}: expected JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const error = value?.error_description || value?.error || `HTTP ${response.status}`;
    throw new Error(`${label}: ${String(error).slice(0, 180)}`);
  }
  return value;
}

async function registerClient(redirectUri) {
  const response = await fetch(`${AUTH_ORIGIN}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: `SyrianFatora local smoke ${new Date().toISOString()}`,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const client = await readJson(response, "OAuth dynamic client registration");
  assert.equal(typeof client.client_id, "string", "registration did not return client_id");
  return client;
}

async function getOrRegisterClient(redirectUri) {
  try {
    const cached = JSON.parse(await readFile(CLIENT_CACHE_PATH, "utf8"));
    const age = Date.now() - Number(cached.registeredAt);
    if (
      typeof cached.client_id === "string" &&
      cached.redirect_uri === redirectUri &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < CLIENT_CACHE_MAX_AGE_MS
    ) {
      return { client: { client_id: cached.client_id }, reused: true };
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }

  const client = await registerClient(redirectUri);
  await mkdir(path.dirname(CLIENT_CACHE_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CLIENT_CACHE_PATH, JSON.stringify({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    registeredAt: Date.now(),
  }, null, 2) + "\\n", { mode: 0o600 });
  await chmod(CLIENT_CACHE_PATH, 0o600);
  return { client, reused: false };
}

function waitForAuthorizationCode(server, expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OAuth callback timed out after five minutes")), CALLBACK_TIMEOUT_MS);
    server.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method !== "GET" || url.pathname !== "/callback") {
        response.writeHead(404, { "Cache-Control": "no-store" });
        response.end("Not found");
        return;
      }
      if (url.searchParams.get("state") !== expectedState) {
        response.writeHead(400, { "Cache-Control": "no-store" });
        response.end("OAuth state mismatch. Return to the terminal and retry.");
        return;
      }
      const oauthError = url.searchParams.get("error");
      if (oauthError) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        response.end("Authorization was not completed. You may close this tab.");
        clearTimeout(timer);
        reject(new Error(`OAuth authorization returned ${oauthError}`));
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        response.writeHead(400, { "Cache-Control": "no-store" });
        response.end("Authorization code is missing.");
        clearTimeout(timer);
        reject(new Error("OAuth callback did not contain an authorization code"));
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      response.end("<!doctype html><title>SyrianFatora connected</title><p>Authorization received. Return to the terminal; you may close this tab.</p>");
      clearTimeout(timer);
      resolve(code);
    });
    server.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function exchangeCode({ clientId, redirectUri, code, verifier }) {
  const response = await fetch(`${AUTH_ORIGIN}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: MCP_RESOURCE,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const tokens = await readJson(response, "OAuth authorization-code exchange");
  assert.equal(typeof tokens.access_token, "string", "token response did not include access_token");
  assert.match(String(tokens.token_type), /^bearer$/i, "token_type is not Bearer");
  assert.ok(Number(tokens.expires_in) > 0, "access token expiry is missing");
  return tokens;
}

async function mcpRequest(method, params, accessToken, id, sessionId) {
  const response = await fetch(`${MCP_ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
      ...(sessionId ? { "MCP-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const bodyText = await response.text();
  if (response.status !== 200) {
    // Never print response bodies: they may contain customer data or credentials.
    throw new Error(`MCP ${method} returned HTTP ${response.status}`);
  }
  let message;
  try {
    message = JSON.parse(bodyText);
  } catch {
    throw new Error(`MCP ${method} returned a non-JSON response`);
  }
  if (message.error) {
    throw new Error(`MCP ${method} returned JSON-RPC error ${message.error.code}`);
  }
  assert.equal(message.jsonrpc, "2.0", `MCP ${method} returned an invalid JSON-RPC envelope`);
  assert.equal(message.id, id, `MCP ${method} response ID did not match`);
  return { message, sessionId: response.headers.get("MCP-Session-Id") ?? sessionId };
}

async function mcpNotification(method, accessToken, sessionId) {
  const response = await fetch(`${MCP_ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
      ...(sessionId ? { "MCP-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method }),
    signal: AbortSignal.timeout(15_000),
  });
  if (![200, 202, 204].includes(response.status)) {
    throw new Error(`MCP notification ${method} returned HTTP ${response.status}`);
  }
}

async function main() {
  console.log("SyrianFatora authenticated production smoke test");
  console.log(`Auth: ${AUTH_ORIGIN}`);
  console.log(`MCP:  ${MCP_ORIGIN}`);
  console.log("Read-only checks only. Tokens, API keys, and customer records are never printed.\n");

  assert.ok(Number.isInteger(CALLBACK_PORT) && CALLBACK_PORT > 0 && CALLBACK_PORT <= 65535,
    "SMOKE_CALLBACK_PORT must be a valid TCP port");
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(CALLBACK_PORT, "127.0.0.1", resolve);
  });

  try {
    const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
    const { client, reused } = await getOrRegisterClient(redirectUri);
    const state = base64url(randomBytes(32));
    const verifier = base64url(randomBytes(32));
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const codePromise = waitForAuthorizationCode(server, state);

    const authorizationUrl = new URL(`${AUTH_ORIGIN}/authorize`);
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: redirectUri,
      scope: "mcp:read",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: MCP_RESOURCE,
    }).toString();

    console.log(`1/5 OAuth test client ${reused ? "reused from local cache" : "registered and cached"}.`);
    console.log("\nOpen this URL in your browser and approve the read-only mcp:read permission.");
    console.log("Enter your SyrianFatora API key only on the official HTTPS authorization page:\n");
    console.log(authorizationUrl.toString());
    console.log("\nWaiting up to five minutes for the local OAuth callback...");

    const code = await codePromise;
    const tokens = await exchangeCode({
      clientId: client.client_id,
      redirectUri,
      code,
      verifier,
    });
    console.log("2/5 OAuth authorization code exchanged; a Bearer access token was issued.");

    const initialized = await mcpRequest("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "syrianfatora-authenticated-smoke", version: "1.0.0" },
    }, tokens.access_token, 1);
    assert.equal(initialized.message.result?.serverInfo?.name, "syrianfatora-mcp");
    console.log("3/5 Authenticated MCP initialize succeeded.");
    await mcpNotification("notifications/initialized", tokens.access_token, initialized.sessionId);

    const listed = await mcpRequest("tools/list", {}, tokens.access_token, 2, initialized.sessionId);
    const tools = listed.message.result?.tools;
    assert.ok(Array.isArray(tools), "tools/list did not return a tools array");
    assert.equal(tools.length, 51, `expected 51 tools; received ${tools.length}`);
    assert.ok(tools.some((tool) => tool.name === "customers_list"), "customers_list is missing");
    console.log("4/5 Authenticated tools/list succeeded (51 tools; customers_list present).");

    const called = await mcpRequest("tools/call", {
      name: "customers_list",
      arguments: { query: { per_page: 1 } },
    }, tokens.access_token, 3, listed.sessionId);
    const result = called.message.result;
    assert.ok(result && result.isError === false, "customers_list returned an MCP tool error");
    const content = Array.isArray(result.content) ? result.content : [];
    const textContent = content.find((item) => item.type === "text")?.text;
    assert.equal(typeof textContent, "string", "customers_list returned no text result");

    let upstream;
    try {
      upstream = JSON.parse(textContent);
    } catch {
      throw new Error("customers_list returned an unexpected result format");
    }
    assert.ok(Number(upstream.status) >= 200 && Number(upstream.status) < 300,
      `customers_list upstream request returned HTTP ${upstream.status}`);
    console.log(`5/5 Authenticated customers_list succeeded (upstream HTTP ${upstream.status}; per_page=1).`);

    console.log("\nPASS: real OAuth session and read-only MCP tool call verified.");
  } finally {
    server.close();
  }
}

main().catch(() => {
  safeFailure();
});
