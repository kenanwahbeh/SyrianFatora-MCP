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

## Authorization abuse protection

Before validating a submitted API key, the approval POST applies two narrow protections: an IP attempt window and a repeated credential-fingerprint attempt window. These protect the authorization form from abuse only. They do not meter normal MCP requests and are not a substitute for SyrianFatora workspace quota enforcement.

Do not add per-credential API request quotas or per-OAuth-grant request quotas. SyrianFatora is authoritative for workspace usage and quota. The Durable Object remains for authorization-attempt protection and provider-directed 429 cooldown state only.

## Security and known gaps

- Never place a real API key in source control, an issue, a test fixture, or a chat message.
- The validation call is read-only but consumes SyrianFatora API quota.
- A 403 from validation means the key lacks `customers.read` or API access is disabled; do not misreport it as an invalid key.
- The provider encrypts authorization `props`; the resource Worker must not log or expose `props.upstreamApiKey`.
- The random OAuth subject identifies a grant, not a verified human identity or SyrianFatora workspace ID.
- Credential replacement and disconnect/revocation UX are not implemented yet.
- Preview smoke tests verify OAuth discovery, DCR, PKCE consent, protected-resource metadata, and MCP-to-Auth service binding. Full token issuance and refresh with a valid SyrianFatora API key remain unverified.
- The user has deferred automated tests for the immediate production migration; this is not a passing test result.

## Shared guard and secrets

The authorization Worker exports the SQLite-backed `CredentialRateLimiter` Durable Object. It stores only authorization IP/credential-attempt events and provider-directed 429 cooldown state. It does not count normal MCP requests or enforce a local API quota.

Required authorization-attempt variables:
- RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS
- RATE_LIMIT_AUTH_IP_WINDOW_SECONDS
- RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS
- RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS

Set `RATE_LIMIT_HMAC_SECRET` on both Workers to the same random value of at least 32 bytes. The HMAC is used for privacy-preserving credential identities; never commit the secret or store raw API keys/IP addresses in limiter records.

A cooldown is stored only when SyrianFatora returns a valid `Retry-After` header. Its duration is taken from that header. There is no local fallback cooldown. If the provider omits or supplies an invalid header, no local cooldown is created.

Preview retains isolated authorization-attempt thresholds. It does not define API usage quotas or a fallback cooldown duration.

## Preview deployment

This application has an isolated Cloudflare Preview Worker. The associated Build configuration is pinned to the `test/durable-object-atomicity` branch. Production deployment is intentionally disabled in this configuration.
