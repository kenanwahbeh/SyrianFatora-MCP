# Architecture

**Current implementation:** two independent Cloudflare Workers, with the existing MCP resource Worker retained in place.

## Components

- **MCP resource Worker — `syrianfatora-mcp`:** public `/mcp` endpoint, tool catalogue, request validation, scope enforcement, upstream REST adapter and token validation.
- **OAuth authorization Worker — `syrianfatora-auth`:** OAuth 2.1 discovery/registration, Authorization Code + PKCE, consent page, upstream-key validation and provider-managed token/grant lifecycle.
- **Service Binding — `AUTH_SERVER`:** MCP calls the Auth Worker entrypoint `SyrianFatoraAuth` to validate access tokens.
- **Durable Object binding — `RATE_LIMITER`:** MCP accesses `CredentialRateLimiter` exported by the Auth Worker.
- **KV — `OAUTH_KV`:** provider OAuth state configured by the Auth Worker.
- **OAuth provider:** `@cloudflare/workers-oauth-provider@1.2.4`.

The Auth Worker is not a second public MCP endpoint.

## Request and authorization flow

1. The MCP client discovers protected-resource metadata from the MCP endpoint.
2. Metadata identifies the Auth issuer.
3. The user is redirected to the first-party HTTPS authorization page.
4. Auth validates the OAuth request and browser-bound consent transaction.
5. The user enters the Workspace API key and selects scopes; `mcp:read` is required.
6. Auth validates the key using read-only `GET /customers?per_page=1`.
7. Auth completes Authorization Code + PKCE and stores the key in provider-encrypted grant properties.
8. MCP validates the access token through the internal Service Binding and receives the trusted grant properties.
9. MCP calls `https://syrianfatora.com/api/public/v1` using the key in a server-side Bearer header.
10. The upstream key is never returned to the MCP client.

## MCP tool surface

The resource/action registry in `apps/mcp/src/handler.mjs` defines 51 tools across 12 resources. `apps/mcp/src/rest-contract.mjs` contains the per-resource query/body schemas. The runtime `tools/list` response is authoritative.

Notable boundaries:
- Customers and invoices expose list/get/create only.
- Payment methods expose list only and are non-paginated.
- Payment void is a soft-void operation; the MCP argument and REST body field are `void_reason`.
- The wrapper rejects undocumented fields rather than passing arbitrary query/body data upstream.

## Scope model

- `mcp:read` is required for all MCP access and read operations.
- Create, update and delete actions additionally require `mcp:write`.
- The upstream Workspace API key must independently have the resource permission required by SyrianFatora.

Auth supports `mcp:read`, `mcp:write`, and optional `offline_access`. Refresh-token issuance is suppressed when `offline_access` is not in the effective requested scope.

## Grant isolation and identity limits

Each authorization grant contains one validated upstream credential. Its random subject identifies that grant only; it is not a verified human identity or stable Workspace ID. The current validation response does not expose a stable Workspace identifier. Reauthorization therefore creates an independent grant and does not automatically replace or revoke another grant.

## Quota and abuse controls

SyrianFatora owns Workspace API quota. The integration does not impose local daily/monthly or per-key/per-grant MCP request quotas.

Auth protects repeated authorization submissions using IP and credential-fingerprint attempt controls. MCP checks a credential-scoped cooldown only when the provider has returned HTTP 429 with a valid `Retry-After`. The provider-specified duration is used; there is no locally invented fallback and no automatic retry. HMAC fingerprints are not Workspace identifiers or usage counters.

## Protocol and request safeguards

The MCP handler supports protocol versions `2025-11-25`, `2025-03-26`, and `2024-11-05`. It validates browser Origin values, bounds request and upstream response bodies, applies an upstream timeout, rejects redirects, redacts the API key from response text, and returns no-store responses. The newer stateless `2026-07-28` lifecycle is not implemented.

## Production identity

- MCP resource: `https://syrianfatora-mcp.kinan-api.workers.dev/mcp`
- Auth issuer: `https://syrianfatora-auth.kinan-api.workers.dev`

Current version/deployment IDs, traffic allocation and rollback references belong only in [the production runbook](production-migration.md).

## Known product limitations

- No stable Workspace ID is available from the current key-validation response.
- Reauthorization does not replace an earlier grant.
- A user-facing disconnect or credential-replacement management page is not implemented.
- Actual ChatGPT/client disconnect and RFC 7009 revocation behavior remains unverified.

## Non-goals

- Replacing or renaming the existing MCP Worker.
- Creating another public MCP resource endpoint.
- Exposing API keys to clients or storing a plaintext KV copy.
- Inventing upstream endpoints, fields or resource actions.
- Introducing local MCP usage quotas or automatic upstream retries.
