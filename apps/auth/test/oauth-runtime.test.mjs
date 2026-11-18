import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "vite";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const authBundlePath = path.join(
  appRoot,
  ".cloudflare/output/v1/workers/default/bundle/index.js",
);
const resourceWorkerEntry = fileURLToPath(
  new URL("../test-support/resource-runtime-worker.mjs", import.meta.url),
);
const resourceWorkerOutDir = path.join(
  appRoot,
  ".cloudflare/test/resource-runtime-worker",
);

const ISSUER = "http://localhost:8787";
const MCP_RESOURCE = "https://mcp.example.test/mcp";
const TEST_KEYS = [
  "sk_test_runtime_only_key_123456",
  "sk_test_runtime_second_key_654321",
];
const REDIRECT_URI = "http://localhost:8787/callback";
const CIMD_URL = "https://syrianfatora-mcp-oauth-preview.kinan-api.workers.dev/oauth/client-metadata.json";

let miniflare;
let resourceServer;
let resourceWorkerPath;
const outboundRequests = [];

// The resource-server fixture imports the OAuth provider from node_modules.
// Workerd only loads modules that Miniflare registers explicitly, so bundle
// the fixture (keeping `cloudflare:*` external) before starting the runtime.
async function bundleResourceWorker() {
  await rm(resourceWorkerOutDir, { recursive: true, force: true });
  await build({
    configFile: false,
    root: appRoot,
    logLevel: "silent",
    build: {
      outDir: resourceWorkerOutDir,
      emptyOutDir: true,
      minify: false,
      target: "esnext",
      lib: {
        entry: resourceWorkerEntry,
        formats: ["es"],
        fileName: () => "resource-runtime-worker.js",
      },
      rollupOptions: {
        external: (id) => id.startsWith("cloudflare:"),
      },
    },
  });
  return path.join(resourceWorkerOutDir, "resource-runtime-worker.js");
}

before(async () => {
  try {
    await access(authBundlePath);
  } catch {
    throw new Error(
      `Missing auth Worker bundle at ${authBundlePath}. Run "npm run build" before "npm test".`,
    );
  }
  resourceWorkerPath = await bundleResourceWorker();
  miniflare = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      name: "auth",
      scriptPath: authBundlePath,
      modules: true,
      compatibilityDate: "2026-11-17",
      // Keep strict public-fetch routing out of this isolated Miniflare mock
      // test; production retains the flag in its deployed Worker configuration.
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
        ACCESS_TOKEN_TTL_SECONDS: "60",
        REFRESH_TOKEN_TTL_SECONDS: "60",
        // Client registrations must outlive the token-expiry wait below;
        // otherwise the refresh attempt fails as an unknown client (401)
        // instead of an expired refresh token (400).
        CLIENT_REGISTRATION_TTL_SECONDS: "3600",
      },
      kvNamespaces: ["OAUTH_KV"],
      durableObjects: {
        RATE_LIMITER: { className: "CredentialRateLimiter", useSQLite: true },
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        const authorization = request.headers.get("Authorization");
        outboundRequests.push({
          method: request.method,
          path: url.pathname + url.search,
          authorization,
        });
        if (request.method === "GET" && url.href === CIMD_URL) {
          return Response.json({
            client_id: CIMD_URL,
            client_name: "CIMD runtime test client",
            redirect_uris: [REDIRECT_URI],
            response_types: ["code"],
            grant_types: ["authorization_code"],
            token_endpoint_auth_method: "none",
          }, {
            headers: { "Cache-Control": "no-store" },
          });
        }
        if (
          request.method === "GET" &&
          url.origin === "https://syrianfatora.com" &&
          url.pathname === "/api/public/v1/customers" &&
          url.search === "?per_page=1" &&
          TEST_KEYS.includes(authorization?.replace("Bearer ", ""))
        ) {
          return new Response(null, { status: 200 });
        }
        return new Response("Unexpected outbound request blocked by test harness", { status: 502 });
      },
    },
    {
      name: "resource",
      scriptPath: resourceWorkerPath,
      modules: true,
      compatibilityDate: "2026-11-17",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {
        MCP_SERVER_URL: MCP_RESOURCE,
      },
      serviceBindings: {
        AUTH_SERVER: { name: "auth", entrypoint: "SyrianFatoraAuth" },
      },
    }],
  }));
  await miniflare.ready;
  resourceServer = await miniflare.getWorker("resource");
});

after(async () => {
  await miniflare?.dispose();
  await rm(resourceWorkerOutDir, { recursive: true, force: true });
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
  assert.equal(metadata.client_id_metadata_document_supported, true);
});

test("dynamic client registration rejects incomplete metadata", async () => {
  const response = await request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Incomplete runtime client",
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(response.status, 400);
});

test("CIMD rejects a root client identifier before metadata resolution", async () => {
  const verifier = "runtime-cimd-verifier-that-is-long-enough";
  const params = authorizationParams(
    { client_id: "https://client.example.test" },
    {
      code_challenge: await s256(verifier),
    },
  );
  const response = await request(`/authorize?${params}`);
  assert.equal(response.status, 400);
});

test("CIMD resolves a valid HTTPS metadata document and validates its exact client_id", async () => {
  const outboundStart = outboundRequests.length;
  const verifier = "runtime-cimd-success-verifier-that-is-long-enough";
  const params = authorizationParams(
    { client_id: CIMD_URL },
    { code_challenge: await s256(verifier) },
  );

  const response = await request(`/authorize?${params}`);
  assert.equal(response.status, 200, await response.clone().text());
  const html = await response.text();
  assert.match(html, /CIMD runtime test client/);
  assert.match(html, /Connect your SyrianFatora workspace/);

  const cimdRequests = outboundRequests.slice(outboundStart);
  assert.ok(cimdRequests.length >= 1, "authorization must fetch the configured CIMD document");
  for (const cimdRequest of cimdRequests) {
    assert.equal(cimdRequest.method, "GET");
    assert.equal(cimdRequest.path, "/oauth/client-metadata.json");
    assert.equal(cimdRequest.authorization, null);
  }
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

async function approveAuthorization(handle, cookie, scopes = ["mcp:read"], apiKey = TEST_KEYS[0]) {
  const outboundStart = outboundRequests.length;
  const body = new URLSearchParams({
    handle,
    decision: "approve",
    api_key: apiKey,
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
  const observedOutbound = outboundRequests.slice(outboundStart);
  assert.ok(
    observedOutbound.length > 0,
    `approval did not reach outboundService; observed ${observedOutbound.length} outbound calls; response status ${response.status}`,
  );
  const outbound = observedOutbound.at(-1);
  assert.equal(outbound.method, "GET");
  assert.equal(outbound.path, "/api/public/v1/customers?per_page=1");
  assert.equal(outbound.authorization, `Bearer ${apiKey}`);
  assert.equal(
    response.status,
    302,
    `approval should redirect after successful validation; got ${response.status}: ${await response.clone().text()}`,
  );
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

test("invalid consent handles are rejected before any upstream credential validation", async () => {
  const outboundStart = outboundRequests.length;
  const response = await request("/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": "192.0.2.11",
      Cookie: "oauth_consent=invalid-binding",
    },
    body: new URLSearchParams({
      handle: "definitely-invalid-consent-handle",
      decision: "approve",
      api_key: "sk_test_runtime_only_key_123456",
      scope: "mcp:read",
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(outboundRequests.length, outboundStart);
});

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
  assert.match(tokens.token_type, /^bearer$/i);
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

async function resourceValidate(token) {
  const response = await resourceServer.fetch("https://mcp.example.test/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
  return response;
}

async function refreshToken(client, refreshToken) {
  return request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: client.client_id,
      resource: MCP_RESOURCE,
    }),
  });
}

async function revokeToken(client, token, hint = "refresh_token") {
  return request("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      token_type_hint: hint,
      client_id: client.client_id,
    }),
  });
}

test("access and refresh tokens expire and resource-server validation reflects revocation", async () => {
  const client = await registerPublicClient();
  const verifier = "runtime-lifecycle-verifier-that-is-long-enough";
  const { handle, cookie } = await beginAuthorization(client, verifier, "mcp:read offline_access");
  const approval = await approveAuthorization(handle, cookie, ["mcp:read", "offline_access"]);
  const redirect = new URL(approval.headers.get("Location"));
  const code = redirect.searchParams.get("code");
  assert.ok(code);

  const issued = await exchangeCode(client, code, verifier);
  assert.equal(issued.status, 200, await issued.clone().text());
  const tokens = await issued.json();
  assert.equal(tokens.expires_in, 60);
  assert.ok(tokens.refresh_token);

  const live = await resourceValidate(tokens.access_token);
  assert.equal(live.status, 200, await live.clone().text());
  const liveData = await live.json();
  assert.equal(liveData.props.provider, "syrianfatora");
  assert.equal(liveData.props.upstreamApiKey, TEST_KEYS[0]);

  await new Promise((resolve) => setTimeout(resolve, 61_500));

  const expiredAccess = await resourceValidate(tokens.access_token);
  assert.equal(expiredAccess.status, 401, await expiredAccess.clone().text());

  const expiredRefresh = await refreshToken(client, tokens.refresh_token);
  assert.equal(expiredRefresh.status, 400, await expiredRefresh.clone().text());
  const refreshError = await expiredRefresh.json();
  assert.equal(refreshError.error, "invalid_grant");
});

test("resource-server validation isolates grants by their stored upstream credentials", async () => {
  const clientA = await registerPublicClient();
  const clientB = await registerPublicClient();
  const verifierA = "runtime-tenant-a-verifier-that-is-long-enough";
  const verifierB = "runtime-tenant-b-verifier-that-is-long-enough";

  const consentA = await beginAuthorization(clientA, verifierA);
  const approvalA = await approveAuthorization(consentA.handle, consentA.cookie, ["mcp:read"], TEST_KEYS[0]);
  const codeA = new URL(approvalA.headers.get("Location")).searchParams.get("code");
  const tokenA = await exchangeCode(clientA, codeA, verifierA);
  assert.equal(tokenA.status, 200, await tokenA.clone().text());
  const tokensA = await tokenA.json();

  const consentB = await beginAuthorization(clientB, verifierB);
  const approvalB = await approveAuthorization(consentB.handle, consentB.cookie, ["mcp:read"], TEST_KEYS[1]);
  const codeB = new URL(approvalB.headers.get("Location")).searchParams.get("code");
  const tokenB = await exchangeCode(clientB, codeB, verifierB);
  assert.equal(tokenB.status, 200, await tokenB.clone().text());
  const tokensB = await tokenB.json();

  const responseA = await resourceValidate(tokensA.access_token);
  const responseB = await resourceValidate(tokensB.access_token);
  assert.equal(responseA.status, 200, await responseA.clone().text());
  assert.equal(responseB.status, 200, await responseB.clone().text());
  const dataA = await responseA.json();
  const dataB = await responseB.json();
  assert.equal(dataA.props.upstreamApiKey, TEST_KEYS[0]);
  assert.equal(dataB.props.upstreamApiKey, TEST_KEYS[1]);
  assert.notEqual(dataA.props.grantSubject, dataB.props.grantSubject);

  const revoked = await revokeToken(clientA, tokensA.access_token, "access_token");
  assert.equal(revoked.status, 200, await revoked.clone().text());

  const revokedA = await resourceValidate(tokensA.access_token);
  const stillValidB = await resourceValidate(tokensB.access_token);
  assert.equal(revokedA.status, 401, await revokedA.clone().text());
  assert.equal(stillValidB.status, 200, await stillValidB.clone().text());
});

test("refresh tokens rotate and the previous refresh token is rejected", async () => {
  const client = await registerPublicClient();
  const verifier = "runtime-refresh-verifier-that-is-long-enough";
  const { handle, cookie } = await beginAuthorization(client, verifier, "mcp:read offline_access");
  const approval = await approveAuthorization(handle, cookie, ["mcp:read", "offline_access"]);
  const redirect = new URL(approval.headers.get("Location"));
  const code = redirect.searchParams.get("code");
  assert.ok(code);

  const first = await exchangeCode(client, code, verifier);
  assert.equal(first.status, 200, await first.clone().text());
  const firstTokens = await first.json();
  assert.ok(firstTokens.refresh_token);

  const refreshed = await refreshToken(client, firstTokens.refresh_token);
  assert.equal(refreshed.status, 200, await refreshed.clone().text());
  const secondTokens = await refreshed.json();
  assert.ok(secondTokens.refresh_token);
  assert.notEqual(secondTokens.refresh_token, firstTokens.refresh_token);

  // The provider deliberately accepts the immediately previous refresh token
  // once, which closes a concurrent-refresh race without allowing indefinite replay.
  const previous = await refreshToken(client, firstTokens.refresh_token);
  assert.equal(previous.status, 200, await previous.clone().text());
  const thirdTokens = await previous.json();
  assert.ok(thirdTokens.refresh_token);
  assert.notEqual(thirdTokens.refresh_token, secondTokens.refresh_token);

  // Rotate once more with the current token. The original token is now outside
  // the one-token concurrency grace window and must fail.
  const fourth = await refreshToken(client, thirdTokens.refresh_token);
  assert.equal(fourth.status, 200, await fourth.clone().text());
  const fourthTokens = await fourth.json();
  assert.ok(fourthTokens.refresh_token);

  const replay = await refreshToken(client, firstTokens.refresh_token);
  assert.equal(replay.status, 400, await replay.clone().text());
  const replayError = await replay.json();
  assert.equal(replayError.error, "invalid_grant");
});

test("revoking a refresh token revokes the grant and blocks further refresh", async () => {
  const client = await registerPublicClient();
  const verifier = "runtime-revocation-verifier-that-is-long-enough";
  const { handle, cookie } = await beginAuthorization(client, verifier, "mcp:read offline_access");
  const approval = await approveAuthorization(handle, cookie, ["mcp:read", "offline_access"]);
  const redirect = new URL(approval.headers.get("Location"));
  const code = redirect.searchParams.get("code");
  assert.ok(code);

  const issued = await exchangeCode(client, code, verifier);
  assert.equal(issued.status, 200, await issued.clone().text());
  const tokens = await issued.json();
  assert.ok(tokens.refresh_token);

  const revoked = await revokeToken(client, tokens.refresh_token);
  assert.equal(revoked.status, 200, await revoked.clone().text());

  const refreshAfterRevoke = await refreshToken(client, tokens.refresh_token);
  assert.equal(refreshAfterRevoke.status, 400, await refreshAfterRevoke.clone().text());
  const error = await refreshAfterRevoke.json();
  assert.equal(error.error, "invalid_grant");
});

test("authorization code is bound to its client and cannot be exchanged by another client", async () => {
  const clientA = await registerPublicClient();
  const clientB = await registerPublicClient();
  const verifier = "runtime-client-binding-verifier-that-is-long-enough";
  const { handle, cookie } = await beginAuthorization(clientA, verifier);
  const approval = await approveAuthorization(handle, cookie);
  const redirect = new URL(approval.headers.get("Location"));
  const code = redirect.searchParams.get("code");
  assert.ok(code);

  const response = await exchangeCode(clientB, code, verifier);
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
