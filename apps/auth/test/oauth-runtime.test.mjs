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
    },
    kvNamespaces: ["OAUTH_KV"],
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

