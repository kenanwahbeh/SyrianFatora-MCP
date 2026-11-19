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

## Provider-owned quota

SyrianFatora is the sole authority for workspace API quota. This Worker must not apply local per-credential request quotas, per-OAuth-grant quotas, or local daily/monthly caps. Normal MCP requests are not counted by a local usage limiter.

Before an upstream call, the Worker checks only whether SyrianFatora previously returned HTTP 429 with a valid `Retry-After` value for this credential. If so, it waits for the provider-specified period and returns a controlled 429 with `Retry-After`. No local fallback duration is invented. If the provider did not supply a valid `Retry-After`, no local cooldown is created. The Worker never automatically retries upstream requests.

The credential HMAC fingerprint is used only to scope authorization anti-abuse and provider-directed cooldown state. It is not a workspace identity or quota counter.

## Build and testing

`npm run build:check` validates the Worker build without deploying; `npm test` runs unit tests. The user has deferred automated tests for the immediate production migration. Do not describe this as successful end-to-end OAuth verification. Use only safe, read-only production probes.

## Provider response headers

The MCP response includes SyrianFatora's `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` values when present. Those provider values are authoritative. The MCP Worker does not calculate or replace workspace quota locally.

## Preview deployment

This application has an isolated Cloudflare Preview Worker. The associated Build configuration is pinned to the `test/durable-object-atomicity` branch. Production deployment is intentionally disabled in this configuration.
