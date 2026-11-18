import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const ISSUER = "http://localhost:8787";
const MCP_RESOURCE = "https://mcp.example.test/mcp";
const REDIRECT_URI = "http://localhost:8787/callback";

let miniflare;
const outboundRequests = [];

before(async () => {
  miniflare = new Miniflare(convertV4MiniflareOptions({
    workers: [{
    name: "auth",
    scriptPath: new URL("../.cloudflare/output/v1/workers/default/bundle/index.js", import.meta.url).pathname,
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
      RATE_LIMIT_CREDENTIAL_MAX_REQUESTS: "100",
      RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS: "60",
      RATE_LIMIT_GRANT_WINDOW_SECONDS: "60",
    },
    kvNamespaces: ["OAUTH_KV"],
    durableObjects: {
      RATE_LIMITER: { className: "CredentialRateLimiter", useSQLite: true },
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      const authorization = request.headers.get("Authorization");
      outboundRequests.push({ method: request.method, url: request.url, authorization });
      if (
        request.method === "GET" &&
        url.origin === "https://syrianfatora.com" &&
        url.pathname === "/api/public/v1/customers" &&
        url.search === "?per_page=1" &&
        authorization === "Bearer sk_test_runtime_only_key_123456"
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

async function request(path, init) {
  return miniflare.dispatchFetch(new URL(path, ISSUER).toString(), { redirect: "manual", ...init });
}

async function registerPublicClient() {
  const response = await request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "SyrianFatora OAuth runtime test",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const client = await response.json();
  assert.equal(typeof client.client_id, "string");
  return client;
}

async function s256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function authorizationParams(client, overrides = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    scope: "mcp:read",
    state: "runtime-test-state",
    code_challenge: "placeholder",
    code_challenge_method: "S256",
    resource: MCP_RESOURCE,
    ...overrides,
  });
}

test("OAuth discovery advertises the configured issuer, resource and endpoints", async () => {
  const response = await request("/.well-known/oauth-authorization-server");
  assert.equal(response.status, 200);
  const metadata = await response.json();
  assert.equal(metadata.issuer, ISSUER);
  assert.equal(metadata.authorization_endpoint, `${ISSUER}/authorize`);
  assert.equal(metadata.token_endpoint, `${ISSUER}/oauth/token`);
  assert.equal(metadata.registration_endpoint, `${ISSUER}/oauth/register`);
  assert.ok(metadata.scopes_supported.includes("mcp:read"));
  assert.ok(metadata.scopes_supported.includes("mcp:write"));
});

test("authorization rejects an unregistered redirect URI before showing consent", async () => {
  const client = await registerPublicClient();
  const verifier = "a-runtime-test-verifier-that-is-long-enough";
  const params = authorizationParams(client, {
    redirect_uri: "https://attacker.example.test/callback",
    code_challenge: await s256(verifier),
  });
  const response = await request(`/authorize?${params}`);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Location"), null);
});

test("authorization rejects public clients that omit PKCE", async () => {
  const client = await registerPublicClient();
  const params = authorizationParams(client, {
    code_challenge: "",
    code_challenge_method: "",
  });
  params.delete("code_challenge");
  params.delete("code_challenge_method");

  const response = await request(`/authorize?${params}`);
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get("Location"));
  assert.equal(redirect.origin, ISSUER);
  assert.equal(redirect.searchParams.get("state"), "runtime-test-state");
  assert.ok(redirect.searchParams.has("error"));
  assert.equal(redirect.searchParams.has("code"), false);
});

test("authorization rejects plain PKCE and accepts only S256 challenges", async () => {
  const client = await registerPublicClient();
  const params = authorizationParams(client, {
    code_challenge: "plain-verifier-value",
    code_challenge_method: "plain",
  });
  const response = await request(`/authorize?${params}`);
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get("Location"));
  assert.equal(redirect.origin, ISSUER);
  assert.equal(redirect.searchParams.get("state"), "runtime-test-state");
  assert.ok(redirect.searchParams.has("error"));
  assert.equal(redirect.searchParams.has("code"), false);
});

test("valid S256 authorization reaches the first-party consent page without redirecting", async () => {
  const client = await registerPublicClient();
  const verifier = "a-runtime-test-verifier-that-is-long-enough";
  const params = authorizationParams(client, {
    scope: "mcp:read mcp:write offline_access",
    code_challenge: await s256(verifier),
  });
  const response = await request(`/authorize?${params}`);
  assert.equal(response.status, 200);
  assert.ok((response.headers.get("Content-Type") || "").includes("text/html"));
  const html = await response.text();
  assert.match(html, /Connect your SyrianFatora workspace/);
  assert.match(html, /name="handle"/);
  assert.ok(html.includes("mcp:read (required)"));
  assert.ok(html.includes("mcp:write (optional)"));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});



async function beginAuthorization(client, verifier, scope = "mcp:read") {
  const params = authorizationParams(client, {
    scope,
    code_challenge: await s256(verifier),
  });
  const response = await request(`/authorize?${params}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  assert.ok(handle, "consent handle must be present");
  const setCookie = response.headers.get("Set-Cookie") || "";
  const cookie = setCookie.split(";")[0];
  assert.ok(cookie, "browser-binding cookie must be present");
  return { handle, cookie };
}

async function approveAuthorization(handle, cookie, scopes = ["mcp:read"]) {
  const body = new URLSearchParams({
    handle,
    decision: "approve",
    api_key: "sk_test_runtime_only_key_123456",
  });
  for (const scope of scopes) body.append("scope", scope);
  const response = await request("/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": "192.0.2.10",
      Cookie: cookie,
    },
    body,
  });
  const outbound = outboundRequests.at(-1);
  assert.ok(outbound, "approval must call the isolated upstream mock");
  assert.equal(outbound.method, "GET");
  assert.equal(outbound.url, "https://syrianfatora.com/api/public/v1/customers?per_page=1");
  assert.equal(outbound.authorization, "Bearer sk_test_runtime_only_key_123456");
  return response;
}

async function exchangeCode(client, code, verifier) {
  return request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: client.client_id,
      code_verifier: verifier,
      resource: MCP_RESOURCE,
    }),
  });
}

test("approval validates a synthetic key through the isolated outbound mock and issues an authorization code", async () => {
  const client = await registerPublicClient();
  const verifier = "runtime-approval-verifier-that-is-long-enough";
  const { handle, cookie } = await beginAuthorization(client, verifier);
  const approval = await approveAuthorization(handle, cookie);
  assert.equal(approval.status, 302, await approval.clone().text());
  const redirect = new URL(approval.headers.get("Location"));
  assert.equal(redirect.origin, new URL(REDIRECT_URI).origin);
  assert.equal(redirect.searchParams.get("state"), "runtime-test-state");
  const code = redirect.searchParams.get("code");
  assert.ok(code, "successful approval must return an authorization code");

  const tokenResponse = await exchangeCode(client, code, verifier);
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  const tokens = await tokenResponse.json();
  assert.equal(typeof tokens.access_token, "string");
  assert.equal(tokens.token_type, "Bearer");
  assert.ok(tokens.expires_in > 0);
});

test("token endpoint rejects a mismatched PKCE verifier", async () => {
  const client = await registerPublicClient();
  const verifier = "runtime-pkce-verifier-that-is-long-enough";
  const { handle, cookie } = await beginAuthorization(client, verifier);
  const approval = await approveAuthorization(handle, cookie);
  assert.equal(approval.status, 302, await approval.clone().text());
  const redirect = new URL(approval.headers.get("Location"));
  const code = redirect.searchParams.get("code");
  assert.ok(code);

  const response = await exchangeCode(client, code, "wrong-verifier-that-is-long-enough");
  assert.equal(response.status, 400, await response.clone().text());
  const error = await response.json();
  assert.equal(error.error, "invalid_grant");
});

test("authorization codes cannot be redeemed more than once", async () => {
  const client = await registerPublicClient();
  const verifier = "runtime-replay-verifier-that-is-long-enough";
  const { handle, cookie } = await beginAuthorization(client, verifier);
  const approval = await approveAuthorization(handle, cookie);
  assert.equal(approval.status, 302, await approval.clone().text());
  const redirect = new URL(approval.headers.get("Location"));
  const code = redirect.searchParams.get("code");
  assert.ok(code);

  const first = await exchangeCode(client, code, verifier);
  assert.equal(first.status, 200, await first.clone().text());
  const second = await exchangeCode(client, code, verifier);
  assert.equal(second.status, 400, await second.clone().text());
  const error = await second.json();
  assert.equal(error.error, "invalid_grant");
});
