# SyrianFatora OAuth Authorization Worker

This Worker is the OAuth 2.1 authorization server for the SyrianFatora MCP resource server.

## Current implementation

- Uses `@cloudflare/workers-oauth-provider@1.2.4` (pinned).
- Implements Authorization Code + PKCE through the provider.
- Supports Client ID Metadata Documents and Dynamic Client Registration for compatible clients.
- Provides a first-party authorization page that displays the requesting client, publisher information, redirect host, and requested scopes.
- Collects the SyrianFatora workspace API key only over the HTTPS form POST.
- Validates the key with the read-only `GET /customers?per_page=1` endpoint.
- Requires the upstream key to have `customers.read` permission and API access enabled.
- Uses possession of the workspace API key as the initial proof of workspace access; it does not claim to authenticate a person's legal identity.
- Passes the upstream key only in the provider's encrypted `props`; it is never returned to the MCP client.
- Exposes a minimal `/health` endpoint.

## Required runtime configuration

The Worker needs:

| Setting | Type | Purpose |
| --- | --- | --- |
| `ISSUER` | Variable | Exact public HTTPS origin of this authorization Worker, without a trailing slash. |
| `MCP_SERVER_URL` | Variable | Exact public HTTPS MCP resource URL, including `/mcp`. Must match the URL used by clients. |
| `OAUTH_KV` | KV binding | OAuth grants, authorization codes, and token state managed by Workers OAuth Provider. |

For Client ID Metadata Documents, the Cloudflare Worker compatibility flags must include `global_fetch_strictly_public`; the current Cloudflare authorization guide also uses `nodejs_compat`. Set a current compatibility date. Do not deploy until the actual issuer and MCP URLs are verified.

## Build and local tests

This package uses the Cloudflare `cf` CLI with the Cloudflare Vite plugin v2. From this directory, run `npm run build:check` to validate the Worker build without deploying, and `npm test` to run unit tests.

The current tests use Node's built-in test runner and do not require a live SyrianFatora key.

## Security notes

- Never place a real API key in source control, an issue, a test fixture, or a chat message.
- Use a test workspace/key when exercising the complete OAuth flow.
- The validation call is read-only but consumes SyrianFatora API quota.
- A 403 from the validation endpoint means the key lacks `customers.read` or API access is disabled.
- The provider encrypts authorization `props` and returns them to the resource Worker after token validation. The resource Worker must not log or expose `props.upstreamApiKey`.
- The random OAuth subject identifies a grant, not a verified human identity or a SyrianFatora workspace ID.
- Revocation and credential replacement UX are not implemented yet.
- This Worker is not deployed and is not connected to production.
