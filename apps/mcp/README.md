# SyrianFatora MCP Resource Worker

This package is the OAuth-protected resource server for the existing production SyrianFatora MCP service.

## Production identity — do not change

- Cloudflare production Worker name: `syrianfatora-mcp`.
- Public MCP endpoint: https://syrianfatora-mcp.kinan-api.workers.dev/mcp.
- This is the existing MCP resource service, migrated in place.
- Do not deploy a second MCP Worker as a replacement or use the Preview name in production.
- Preserve the existing public MCP endpoint identity and all 51 tool definitions.
- Current production version: `8b7e8158-b175-44fe-98d5-4f151eef51f2` (version 10).
- Current deployment: `1c27f7ac-ee02-47a8-9b5e-b28044f7e526` (100% traffic).
- Immediate rollback version: `ef5d0c42-9375-42b2-81e4-73b734707b22` (version 9); deployment `d1f2fbf3-e4e6-46f6-bd3c-8283dc80ff0c`. **Warning:** version 9 re-exposes the Preview CIMD endpoint.
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
- `npm test`: 24 MCP tests pass.
- Production smoke checks pass for MCP health, OAuth protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`, 51 tools reported by health, and rejection of an invalid bearer token with HTTP 401.
- **Not yet verified:** successful authenticated `initialize` and `tools/list` using a token issued after validating a real SyrianFatora workspace API key. Do not paste a real key into chat.
- Never use a production workspace for write-operation tests.

## Authenticated production OAuth smoke test

The repository includes a separate, operator-run end-to-end smoke test. It completes a real OAuth Authorization Code + PKCE flow against the deployed Auth Worker, receives the callback on a temporary loopback HTTP listener, exchanges the code for an access token, and uses that token against the deployed MCP Worker.

Run it from this package directory with Node.js 20 or later:

```bash
npm run smoke:oauth
```

The script:
1. Registers a public OAuth test client with the exact temporary loopback redirect URI.
2. Prints an authorization URL. Open it in a browser and enter the SyrianFatora API key only on the official HTTPS Auth Worker page; approve only `mcp:read`.
3. Captures the OAuth callback locally, validates `state`, and exchanges the authorization code using the PKCE verifier.
4. Calls authenticated MCP `initialize`, `notifications/initialized`, and `tools/list`; verifies the 51-tool catalogue.
5. Calls only `customers_list` with `per_page=1` and verifies a successful upstream HTTP response.

The test never requests `mcp:write`, never performs create/update/delete operations, and does not print or persist the access token, API key, or returned customer records. The API-key validation step in the Auth Worker and the final customer-list call both consume the provider's read quota. The script uses a fixed loopback port (`43127` by default) and caches only the public OAuth client ID and redirect URI in `~/.syrianfatora-smoke/client.json` (file mode `0600`); it does not cache tokens or API keys. It reuses that registration for up to 80 days and then creates a replacement. Each registration remains in Auth Worker KV until its configured TTL expires (currently 90 days); there is no client-unregistration endpoint in this integration. Override the callback port with `SMOKE_CALLBACK_PORT` or the local cache path with `SMOKE_CLIENT_CACHE` if needed.

Optional environment overrides:
- `AUTH_ORIGIN`: deployed authorization-server origin.
- `MCP_ORIGIN`: deployed MCP resource-server origin.
- `SMOKE_CALLBACK_PORT`: local callback port (default `43127`).
- `SMOKE_CLIENT_CACHE`: local path for the non-secret OAuth client cache.

This is intentionally a local/manual production verification, not a GitHub Actions job: the operator must approve the OAuth request and enter the API key in the browser. Do not put the API key or access token in GitHub Secrets, command-line arguments, source control, or CI logs. A successful run prints a final `PASS` line; failures print only bounded status/error information, not response bodies.

The client-cache serialization fix and mocked OAuth/MCP integration harness are merged in PR #51 and included in the 24-test MCP suite. The mock harness validates the script flow locally; it is not production OAuth evidence and does not use a real Workspace key.

## Provider response headers

The MCP response includes SyrianFatora's `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` values when present. Those provider values are authoritative. The MCP Worker does not calculate or replace workspace quota locally.

## Preview deployment

The isolated Preview Worker is separate from production and remains pinned to the `test/durable-object-atomicity` branch. The production Build trigger targets `main` and deploys the existing `syrianfatora-mcp` Worker in place without `--force`. Public version-preview URLs are disabled for production. PR #52 is merged and deployed: production `/oauth/client-metadata.json` returns 404 and the live `IS_PREVIEW` binding is `false`; the Preview CIMD document remains available only in the isolated Preview environment.
