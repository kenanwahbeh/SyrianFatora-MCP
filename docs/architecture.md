# Architecture

## Intended request flow

1. The user opens the MCP connection setup flow and is redirected to the Worker authorization endpoint.
2. The authorization server authenticates the user and collects a SyrianFatora API key through a TLS-protected first-party page.
3. The server validates the supplied key against a safe read-only SyrianFatora endpoint before saving it.
4. The user approves the requested access. Authorization Code + PKCE (`S256`) binds the authorization response to the initiating client.
5. The token endpoint exchanges the one-time authorization code for an MCP access token (and refresh token only if required by the chosen client flow).
6. MCP requests present the OAuth token. The Worker resolves the grant server-side, retrieves the associated upstream key, and calls `https://syrianfatora.com/api/public/v1`.
7. The upstream key is added only to the server-to-server `Authorization: Bearer` header and is never returned to the MCP client.

## Components

- **Cloudflare Worker:** MCP transport, OAuth endpoints, authorization UI, upstream API adapter.
- **OAuth provider library:** Prefer Cloudflare's maintained `workers-oauth-provider` package, after verifying current API and compatibility.
- **Credential/grant storage:** Select a Cloudflare storage product based on required atomicity, encryption and lifecycle semantics. Do not store plaintext credentials in ordinary KV without an explicit threat-model decision.
- **SyrianFatora REST API:** `https://syrianfatora.com/api/public/v1`.
- **ChatGPT plugin package:** Contains only the verified MCP URL and supported OAuth connection metadata; no user-specific secrets.

## Identity and tenancy

Every authorization grant must map to exactly one SyrianFatora credential/workspace. Never infer workspace identity from user-supplied labels. Enforce tenant separation in every upstream request and storage lookup.

## MCP compatibility

Preserve the existing tool catalogue and supported protocol versions where compatible with the authenticated MCP transport. Test `initialize`, `tools/list`, and a harmless read-only tool before enabling writes.

## Non-goals for the first release

- Webhooks
- Multi-workspace switching within one grant
- Administrative access to Cloudflare
- Any direct database access to SyrianFatora
