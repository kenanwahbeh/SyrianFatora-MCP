# SyrianFatora MCP Resource Worker

This package is the OAuth-protected resource server for the existing production SyrianFatora MCP service.

## Production identity — do not change

- Cloudflare production Worker name: `syrianfatora-mcp`.
- Public MCP endpoint: https://syrianfatora-mcp.kinan-api.workers.dev/mcp.
- This is the existing MCP resource service, migrated in place.
- Do not deploy a second MCP Worker as a replacement or use the Preview name in production.
- Preserve the existing public MCP endpoint identity and all 51 tool definitions.
- Current production version: `392a040a-eff8-421d-952b-0075dc74e703` (version 6).
- Current deployment: `6fe36215-6e5d-4368-8744-ea90473b78c3`.
- Previous rollback version captured before the migration: `ab4d6f5c-a8d9-4150-a6a0-120499a2b9c5` (version 4).
- Production workers.dev route is enabled; public version-preview URLs are disabled.

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

| Binding / variable | Production value |
| --- | --- |
| Worker name | `syrianfatora-mcp` |
| `MCP_SERVER_URL` | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| `AUTH_SERVER_URL` | `https://syrianfatora-auth.kinan-api.workers.dev` |
| `AUTH_SERVER` | Service Binding to Worker `syrianfatora-auth`, entrypoint `SyrianFatoraAuth` |
| `RATE_LIMITER` | Durable Object `CredentialRateLimiter` in `syrianfatora-auth`, namespace `1303fb3e6d25453080035c0356b4d4bd` |
| `RATE_LIMIT_HMAC_SECRET` | Secret text; same random 48-byte value as the Auth Worker |

The Cloudflare deployment output and live Worker settings confirm both the Service Binding and Durable Object binding. The MCP Worker has no local daily/monthly/per-key/per-grant usage quota bindings.

## Scope enforcement

| MCP operation | Required scope |
| --- | --- |
| initialize, ping, tools/list, read/list/get calls | `mcp:read` |
| create/update/delete calls | `mcp:read` and `mcp:write` |

Cloudflare's requiredScopes metadata is advertised to clients; this Worker explicitly enforces scopes in its handler as well.

## Provider-owned quota

SyrianFatora is the sole authority for workspace API quota. This Worker must not apply local per-credential request quotas, per-OAuth-grant quotas, or local daily/monthly caps. Normal MCP requests are not counted by a local usage limiter.

Before an upstream call, the Worker checks only whether SyrianFatora previously returned HTTP 429 with a valid `Retry-After` value for this credential. If so, it returns a controlled 429 with the provider-specified `Retry-After`. No local fallback duration is invented. If the provider did not supply a valid `Retry-After`, no local cooldown is created. The Worker never automatically retries upstream requests.

The credential HMAC fingerprint is used only to scope authorization anti-abuse and provider-directed cooldown state. It is not a workspace identity or quota counter.

## Build, testing, and production verification

- `npm audit --audit-level=high`: zero vulnerabilities in the current dependency tree with npm 10.9.2.
- `npm run build:check`: production Worker build succeeds without deployment.
- `npm test`: 21 MCP tests pass.
- Production smoke checks pass for MCP health, OAuth protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`, 51 tools reported by health, and rejection of an invalid bearer token with HTTP 401.
- **Not yet verified:** successful authenticated `initialize` and `tools/list` using a token issued after validating a real SyrianFatora workspace API key. Do not paste a real key into chat.
- Never use a production workspace for write-operation tests.

## Provider response headers

The MCP response includes SyrianFatora's `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` values when present. Those provider values are authoritative. The MCP Worker does not calculate or replace workspace quota locally.

## Preview deployment

The isolated Preview Worker is separate from production and remains pinned to the `test/durable-object-atomicity` branch. The production Build trigger targets `main` and deploys the existing `syrianfatora-mcp` Worker in place. Public version-preview URLs are disabled for production.
