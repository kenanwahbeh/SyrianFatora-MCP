import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const ISSUER = "http://localhost:8787";
const MCP_RESOURCE = "https://mcp.example.test/mcp";
const REDIRECT_URI = "http://localhost:8787/callback";

let miniflare;

before(async () => {
  miniflare = new Miniflare(convertV4MiniflareOptions({
    scriptPath: new URL("../.cloudflare/output/v1/workers/default/bundle/index.js", import.meta.url).pathname,
    modules: true,
    compatibilityDate: "2026-11-17",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    bindings: {
      ISSUER,
      MCP_SERVER_URL: MCP_RESOURCE,
      RATE_LIMIT_HMAC_SECRET: "local-test-only-hmac-secret-at-least-32-bytes",
      RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS: "20",
      RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: "60",
      RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS: "20",
      RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS: "60",
      RATE_LIMIT_CREDENTIAL_MAX_REQUESTS: "100",
      RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS: "86400",
      RATE_LIMIT_GRANT_MAX_REQUESTS: "100",
      RATE_LIMIT_GRANT_WINDOW_SECONDS: "60",
      RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS: "30",
    },
    kvNamespaces: ["OAUTH_KV"],
    durableObjects: {
      RATE_LIMITER: { className: "CredentialRateLimiter", useSQLite: true },
    },
    outboundService: async (outboundRequest) => {
      const url = new URL(outboundRequest.url);
      if (url.hostname === "syrianfatora.com" && url.pathname === "/api/public/v1/customers") {
        return Response.json({ data: [] }, { status: 200 });
      }
      return new Response("Unexpected outbound request in isolated OAuth test", { status: 502 });
    },
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

test("public-client code flow validates PKCE, rejects replay, rotates refresh tokens and revokes grants", async () => {
  const client = await registerPublicClient();
  const verifier = "a-runtime-test-verifier-that-is-long-enough";
  const params = authorizationParams(client, {
    scope: "mcp:read offline_access",
    code_challenge: await s256(verifier),
  });
  const consentResponse = await request(`/authorize?${params}`);
  assert.equal(consentResponse.status, 200);
  const html = await consentResponse.text();
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(handle, "consent handle must be present");

  const form = new URLSearchParams({
    handle,
    decision: "approve",
    api_key: "sk_test_local_only_key_1234567890",
    scope: "mcp:read",
    scope2: "offline_access",
  });
  // Use repeated scope fields, matching the browser form submission.
  form.delete("scope2");
  form.append("scope", "offline_access");
  const approval = await request("/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": "192.0.2.44",
    },
    body: form,
  });
  assert.equal(approval.status, 302, await approval.clone().text());
  const callback = new URL(approval.headers.get("Location"));
  assert.equal(callback.origin, ISSUER);
  assert.ok(callback.searchParams.get("code"));
  assert.equal(callback.searchParams.get("state"), "runtime-test-state");
  const code = callback.searchParams.get("code");

  const exchange = async (codeVerifier) => request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: client.client_id,
      code_verifier: codeVerifier,
      resource: MCP_RESOURCE,
    }),
  });

  const badVerifier = await exchange("incorrect-verifier-value-that-is-long-enough");
  assert.equal(badVerifier.status, 400);
  assert.equal((await badVerifier.json()).error, "invalid_grant");

  const tokenResponse = await exchange(verifier);
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  const tokens = await tokenResponse.json();
  assert.ok(tokens.access_token);
  assert.ok(tokens.refresh_token);

  const replay = await exchange(verifier);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, "invalid_grant");

  const refresh = async (refreshToken) => request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: client.client_id,
      resource: MCP_RESOURCE,
    }),
  });

  const rotatedResponse = await refresh(tokens.refresh_token);
  assert.equal(rotatedResponse.status, 200, await rotatedResponse.clone().text());
  const rotated = await rotatedResponse.json();
  assert.ok(rotated.access_token);
  assert.ok(rotated.refresh_token);
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);

  const revoke = await request("/oauth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: rotated.refresh_token,
      token_type_hint: "refresh_token",
      client_id: client.client_id,
    }),
  });
  assert.equal(revoke.status, 200);

  const revokedRefresh = await refresh(rotated.refresh_token);
  assert.equal(revokedRefresh.status, 400);
  assert.equal((await revokedRefresh.json()).error, "invalid_grant");
});
