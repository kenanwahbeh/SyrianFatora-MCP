# SyrianFatora OAuth MCP Resource Worker

This package is the OAuth-protected resource server for the existing SyrianFatora MCP tool catalogue.

## What it does

- Wraps the MCP handler with Cloudflare Workers OAuth Provider v1 OAuthResourceServer.
- Validates access tokens through the AUTH_SERVER Service Binding; token validation does not call the public Internet.
- Receives validated grant properties from the provider and uses the upstream API key only in the server-side SyrianFatora Bearer header.
- Preserves the existing 51 MCP tools and their request/response contract.
- Requires mcp:read for MCP access and mcp:write for create, update, and delete operations.
- Keeps the existing payment-void reason requirement.
- Enforces a bounded MCP request body and redacts the upstream API key from any echoed upstream response.
- Provides a minimal unauthenticated /health probe. The MCP endpoint and OAuth metadata remain protected by the resource-server middleware.

## Runtime configuration

The example wrangler.jsonc is deliberately a preview-only template:

- Worker name: syrianfatora-mcp-oauth-preview (not the existing production service).
- MCP_SERVER_URL must be replaced with the exact public HTTPS URL including /mcp.
- AUTH_SERVER_URL must be replaced with the exact public HTTPS authorization-server origin.
- The Service Binding targets syrianfatora-auth-preview, entrypoint SyrianFatoraAuth.

Do not deploy this template while its .invalid placeholder URLs remain. Do not rename the preview Worker to syrianfatora-mcp or point it at production until a separate migration review and explicit approval.

## Tests

Run npm test from this directory. Unit tests use a fake upstream fetch; they do not call SyrianFatora or require a real API key.

## Scope enforcement

| MCP operation | Required scope |
| --- | --- |
| initialize, ping, tools/list, list/get tool calls | mcp:read |
| create/update/delete tool calls | mcp:read and mcp:write |

Cloudflare's requiredScopes metadata is advertised to clients; this Worker explicitly enforces the scopes in its handler as well.
