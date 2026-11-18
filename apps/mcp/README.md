# SyrianFatora MCP Resource Worker

This package is the OAuth-protected resource server for the existing production SyrianFatora MCP service.

## Production identity — do not change

- Cloudflare production Worker name: `syrianfatora-mcp`.
- This is the existing MCP resource service and must be migrated in place.
- Do not deploy a second MCP Worker as a replacement or use the preview name in production.
- Preserve the existing public MCP endpoint identity and all 51 tool definitions.

## What it does

- Wraps the MCP handler with Cloudflare Workers OAuth Provider v1 `OAuthResourceServer`.
- Validates access tokens through the `AUTH_SERVER` Service Binding; token validation does not call the public Internet.
- Receives validated grant properties from the provider and uses the upstream API key only in the server-side SyrianFatora Bearer header.
- Preserves the existing 51 MCP tools and their request/response contract.
- Requires `mcp:read` for MCP access and `mcp:write` for create, update, and delete operations.
- Keeps the existing payment-void reason requirement.
- Enforces a bounded MCP request body and redacts the upstream API key from any echoed upstream response.
- Provides a minimal unauthenticated `/health` probe.

## Production runtime configuration

The production configuration must use:

- Worker name: `syrianfatora-mcp`.
- `MCP_SERVER_URL`: exact existing public HTTPS MCP URL, including `/mcp`.
- `AUTH_SERVER_URL`: exact production authorization issuer origin, without a trailing slash.
- `AUTH_SERVER`: Service Binding to Worker `syrianfatora-auth`, entrypoint `SyrianFatoraAuth`.

The current checked-in config is still preview-only and contains `.invalid` URLs. It must not be deployed to production unchanged. Replace placeholders only after the actual URLs and Cloudflare resource names are verified. The existing production Worker name must remain unchanged.

## Scope enforcement

| MCP operation | Required scope |
| --- | --- |
| initialize, ping, tools/list, read/list/get calls | `mcp:read` |
| create/update/delete calls | `mcp:read` and `mcp:write` |

Cloudflare's requiredScopes metadata is advertised to clients; this Worker explicitly enforces scopes in its handler as well.

## Mandatory upstream rate limiting

Every upstream fetch from the MCP handler must pass a limiter before the request is sent. The strict quota identity is a keyed HMAC fingerprint of the upstream API credential, not the random OAuth grant subject, so multiple grants cannot multiply one workspace's allowance. Use a Durable Object to coordinate the strict per-credential budget across requests and Cloudflare locations, with a separate per-grant burst gate. Share the same credential budget with authorization-key validation. Fail closed when the limiter is unavailable and honor upstream 429 / Retry-After with a per-credential cooldown.

The current source does not yet implement this control. Production deployment is blocked until implementation and verification.

## Build and testing

`npm run build:check` validates the Worker build without deploying; `npm test` runs unit tests. The user has deferred automated tests for the immediate production migration. Do not describe this as successful end-to-end OAuth verification. Use only safe, read-only production probes.

## Enforced shared rate limiting

Before every upstream SyrianFatora fetch, the handler calls the shared CredentialRateLimiter Durable Object exported by syrianfatora-auth-preview. It atomically checks the credential-wide sliding window and the per-grant sliding window. The credential-wide counter is shared with the authorization Worker, so multiple grants cannot multiply one workspace's allowance.

The MCP Worker requires the same RATE_LIMIT_HMAC_SECRET value as the authorization Worker. If the Durable Object binding, secret, grant identity or coordinator is unavailable, the handler returns a controlled 503 and does not call SyrianFatora. Quota exhaustion returns 429 with Retry-After.

An upstream 429 is recorded as a per-credential cooldown using the provider's Retry-After value, or the configured fallback cooldown. The handler never retries the upstream request automatically.

## Upstream quota scope

SyrianFatora documents a default daily quota of 1,000 successful requests per workspace, with increases available on request, plus a plan-dependent monthly quota for paid plans. The provider returns X-RateLimit-Limit and X-RateLimit-Remaining on responses and Retry-After on 429. The local limiter is an additional conservative gate; the provider remains authoritative for the monthly plan quota.

Important: the current local budget is keyed by API-key fingerprint, while the provider describes its quota as workspace-wide. Do not issue multiple API keys for one workspace through this integration until a stable workspace identity is available or the keys are otherwise grouped under one limiter identity.

Provider documentation: https://syrianfatora.com/developers

## Preview deployment

This application has an isolated Cloudflare Preview Worker. The associated Build configuration is pinned to the `test/durable-object-atomicity` branch. Production deployment is intentionally disabled in this configuration.
