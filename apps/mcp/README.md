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

## Build and testing

`npm run build:check` validates the Worker build without deploying; `npm test` runs unit tests. The user has deferred automated tests for the immediate production migration. Do not describe this as successful end-to-end OAuth verification. Use only safe, read-only production probes.
