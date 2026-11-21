import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const authBundlePath = path.join(
  appRoot,
  ".cloudflare/output/v1/workers/default/bundle/index.js",
);
const ISSUER = "http://localhost:8787";
const REDIRECT_URI = "http://localhost:8787/callback";
const MCP_RESOURCE = "https://mcp.example.test/mcp";
const API_KEY = "sk_test_scope_escalation_key_123456";

let miniflare;
const outboundRequests = [];

before(async () => {
  await access(authBundlePath);
  miniflare = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      name: "auth",
      scriptPath: authBundlePath,
      modules: true,
      compatibilityDate: "2026-11-17",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      bindings: {
        ISSUER,
        MCP_SERVER_URL: MCP_RESOURCE,
        RATE_LIMIT_HMAC_SECRET: "local-test-only-hmac-secret-at-least-32-bytes",
        RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS: "100",
        RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: "60",
        RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS: "100",
        RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS: "60",
        ACCESS_TOKEN_TTL_SECONDS: "60",
        REFRESH_TOKEN_TTL_SECONDS: "3600",
        CLIENT_REGISTRATION_TTL_SECONDS: "3600",
      },
      kvNamespaces: ["OAUTH_KV"],
      durableObjects: {
        RATE_LIMITER: { className: "CredentialRateLimiter", useSQLite: true },
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        outboundRequests.push({
          method: request.method,
          path: url.pathname + url.search,
          authorization: request.headers.get("Authorization"),
        });
        if (
          request.method === "GET" &&
          url.origin === "https://syrianfatora.com" &&
          url.pathname === "/api/public/v1/customers" &&
          url.search === "?per_page=1" &&
          request.headers.get("Authorization") === `Bearer ${API_KEY}`
        ) {
          return new Response(null, { status: 200 });
        }
        return new Response("Unexpected outbound request blocked by test harness", { status: 502 });
      },
    }],
  }));
  await miniflare.ready;
});

after(async () => {
  await miniflare?.dispose();
});

async function request(pathname, init) {
  return miniflare.dispatchFetch(new URL(pathname, ISSUER).toString(), {
    redirect: "manual",
    ...init,
  });
}

async function s256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function registerClient() {
  const response = await request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "OAuth scope escalation test",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

function cookieFrom(response) {
  const setCookie = response.headers.get("Set-Cookie") || "";
  assert.match(setCookie, /; Secure(?:;|$)/i);
  assert.match(setCookie, /; HttpOnly(?:;|$)/i);
  assert.match(setCookie, /; SameSite=None(?:;|$)/i);
  assert.match(setCookie, /; Partitioned(?:;|$)/i);
  assert.match(setCookie, /; Path=\//i);
  const cookie = setCookie.split(";")[0];
  assert.ok(cookie, "consent response must set its browser-binding cookie");
  return cookie;
}

test("consent rejects a supported scope that was not requested and reissues a safe handle", async () => {
  const client = await registerClient();
  const verifier = "scope-escalation-test-verifier-long-enough";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    scope: "mcp:read",
    state: "scope-escalation-state",
    code_challenge: await s256(verifier),
    code_challenge_method: "S256",
    resource: MCP_RESOURCE,
  });

  const page = await request(`/authorize?${params}`);
  assert.equal(page.status, 200, await page.clone().text());
  const html = await page.text();
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  assert.ok(handle);
  const browserCookie = cookieFrom(page);

  const escalatedBody = new URLSearchParams({
    handle,
    decision: "approve",
    api_key: API_KEY,
  });
  escalatedBody.append("scope", "mcp:read");
  escalatedBody.append("scope", "mcp:write");

  const unbound = await request("/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: escalatedBody,
  });
  assert.equal(unbound.status, 400);
  assert.match(await unbound.text(), /not started in this browser/);

  const escalated = await request("/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: browserCookie,
    },
    body: escalatedBody,
  });

  assert.equal(escalated.status, 400);
  const retryHtml = await escalated.text();
  assert.match(retryHtml, /not requested by this application/);
  assert.equal(outboundRequests.length, 0, "scope escalation must be rejected before API-key validation");
  const retryHandle = retryHtml.match(/name="handle" value="([^"]+)"/)?.[1];
  assert.ok(retryHandle);
  assert.notEqual(retryHandle, handle, "the consumed one-time handle must be replaced");
  const retryCookie = cookieFrom(escalated);

  const retried = await request("/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: retryCookie,
    },
    body: new URLSearchParams({
      handle: retryHandle,
      decision: "approve",
      api_key: API_KEY,
      scope: "mcp:read",
    }),
  });

  assert.equal(retried.status, 302, await retried.clone().text());
  assert.equal(outboundRequests.length, 1, "only the valid retry may validate the API key");
  assert.equal(outboundRequests[0].path, "/api/public/v1/customers?per_page=1");
});
