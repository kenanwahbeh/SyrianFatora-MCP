# SyrianFatora OAuth Authorization Worker

This is the separate OAuth 2.1 authorization server required by the existing `syrianfatora-mcp` resource Worker. It does not replace the MCP service and does not expose a second MCP endpoint.

## Production identity

- Planned Cloudflare Worker name: `syrianfatora-auth`.
- Its exported Service Binding entrypoint is `SyrianFatoraAuth`.
- The existing `syrianfatora-mcp` Worker calls it internally through the `AUTH_SERVER` Service Binding.

## Current implementation

- Uses `@cloudflare/workers-oauth-provider@1.2.4` (pinned).
- Implements Authorization Code + PKCE through the provider.
- Supports Client ID Metadata Documents and Dynamic Client Registration for compatible clients.
- Provides a first-party authorization page that displays the requesting client, publisher information, redirect host, and requested scopes.
- Collects the SyrianFatora workspace API key only over the HTTPS form POST.
- Validates the key with the read-only `GET /customers?per_page=1` endpoint.
- Requires the upstream key to have `customers.read` permission and API access enabled.
- Uses possession of the workspace API key as the initial proof of workspace access; it does not claim to authenticate a person's legal identity.
- Passes the upstream key only in provider-encrypted `props`; it is never returned to the MCP client.
- Exposes a minimal `/health` endpoint.

## Required production runtime configuration

| Setting | Type | Purpose |
| --- | --- | --- |
| `ISSUER` | Variable | Exact public HTTPS origin of this authorization Worker, without a trailing slash. |
| `MCP_SERVER_URL` | Variable | Exact existing public HTTPS MCP resource URL, including `/mcp`. |
| `OAUTH_KV` | KV binding | Provider-managed OAuth grants, authorization codes, and token state. |

The Worker needs a production KV namespace and the compatibility flags `nodejs_compat` and `global_fetch_strictly_public`. Do not deploy with `.invalid` URLs or placeholder KV IDs. Verify the account's Worker subdomain or configured custom domain first.

## Security and known gaps

- Never place a real API key in source control, an issue, a test fixture, or a chat message.
- The validation call is read-only but consumes SyrianFatora API quota.
- A 403 from validation means the key lacks `customers.read` or API access is disabled; do not misreport it as an invalid key.
- The provider encrypts authorization `props`; the resource Worker must not log or expose `props.upstreamApiKey`.
- The random OAuth subject identifies a grant, not a verified human identity or SyrianFatora workspace ID.
- Credential replacement and disconnect/revocation UX are not implemented yet.
- Local Worker-runtime integration and full OAuth end-to-end behavior are not verified yet.
- The user has deferred automated tests for the immediate production migration; this is not a passing test result.
