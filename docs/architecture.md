# Architecture

## Decision: split authorization and resource servers

Use the current v1 API of `@cloudflare/workers-oauth-provider`. Its October 2026 design separates the authorization server from the MCP resource server. Keep the existing `syrianfatora-mcp` Worker as the resource server after a tested migration, and create a separate `syrianfatora-auth` Worker for user onboarding, OAuth authorization, token issuance, and credential lifecycle.

The two Workers communicate through a Cloudflare Service Binding. The MCP Worker validates access tokens with the authorization Worker over that binding; token validation does not traverse the public Internet.

## Intended request flow

1. The MCP client requests the protected-resource metadata for the MCP endpoint and discovers the authorization server.
2. The user is redirected to the authorization Worker.
3. The authorization Worker validates the OAuth request, client, redirect URI, resource audience, state, and PKCE challenge.
4. A first-party HTTPS onboarding page asks the user for the SyrianFatora API key and explains the requested access.
5. The auth Worker validates the key using a harmless read-only SyrianFatora API call. It then securely associates the credential with the authenticated subject and grant.
6. The consent page displays the MCP client name, requested scopes, and token destination hostname. The user explicitly approves.
7. Workers OAuth Provider completes the Authorization Code + PKCE flow and issues a token scoped to the MCP resource.
8. The MCP Worker validates the token using the auth Worker Service Binding and receives trusted, encrypted grant properties.
9. The MCP Worker resolves the corresponding SyrianFatora credential server-side and calls `https://syrianfatora.com/api/public/v1` with the upstream Bearer header.
10. The upstream key is never returned to the MCP client.

## Components

- **`syrianfatora-auth` Worker:** OAuth authorization server, consent/onboarding UI, client registration/discovery, credential lifecycle.
- **`syrianfatora-mcp` Worker:** MCP resource server, existing 51-tool catalogue, upstream SyrianFatora API adapter, OAuth token validation through Service Binding.
- **Workers OAuth Provider v1:** `OAuthAuthorizationServer` and `OAuthResourceServer` from `@cloudflare/workers-oauth-provider`.
- **Credential store:** choose storage after confirming the v1 provider's encrypted `props` lifecycle and the requirements for durable per-user upstream credentials. Do not store plaintext credentials in ordinary KV without an explicit threat-model decision.
- **ChatGPT plugin package:** contains only the verified MCP URL and supported OAuth connection metadata; no user-specific secrets.

## Identity and tenancy

Every authorization grant must map to exactly one SyrianFatora credential/workspace. Use an immutable server-side subject/grant identifier. Never trust user-supplied workspace labels as identity. Enforce tenant separation on every storage lookup and upstream request.

## MCP compatibility

Keep the existing tool catalogue and API behavior. Align protocol support with the version negotiated by the current MCP client and Workers OAuth Provider v1. Test initialization, tool listing, and harmless read-only calls before enabling writes.

## Non-goals for the first release

- Webhooks
- Multi-workspace switching within one grant
- Administrative access to Cloudflare
- Direct database access to SyrianFatora
