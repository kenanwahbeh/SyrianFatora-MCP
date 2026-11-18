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

## Mandatory rate-limit requirement

The approval POST must pass an enforced limiter before `validateSyrianFatoraKey` is called. Apply both an edge/IP attempt limit and a repeated credential-fingerprint attempt limit. The credential-level budget must be shared with MCP upstream calls and must not use the raw API key as a limiter key. A strict shared budget requires a Durable Object coordinator; a standard Workers Rate Limiting binding is approximate per Cloudflare location and is not sufficient for strict quota accounting. Fail closed if the limiter is unavailable. Do not deploy this Worker until the gate is implemented and verified.

## Security and known gaps

- Never place a real API key in source control, an issue, a test fixture, or a chat message.
- The validation call is read-only but consumes SyrianFatora API quota.
- A 403 from validation means the key lacks `customers.read` or API access is disabled; do not misreport it as an invalid key.
- The provider encrypts authorization `props`; the resource Worker must not log or expose `props.upstreamApiKey`.
- The random OAuth subject identifies a grant, not a verified human identity or SyrianFatora workspace ID.
- Credential replacement and disconnect/revocation UX are not implemented yet.
- Local Worker-runtime integration and full OAuth end-to-end behavior are not verified yet.
- The user has deferred automated tests for the immediate production migration; this is not a passing test result.

## Enforced rate-limit coordinator

The authorization Worker exports the SQLite-backed CredentialRateLimiter Durable Object. It is the shared quota coordinator for authorization-key validation and MCP upstream calls.

Required Worker variables on the authorization Worker:

- RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS
- RATE_LIMIT_AUTH_IP_WINDOW_SECONDS
- RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS
- RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS
- RATE_LIMIT_CREDENTIAL_MAX_REQUESTS
- RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS
- RATE_LIMIT_GRANT_MAX_REQUESTS
- RATE_LIMIT_GRANT_WINDOW_SECONDS
- RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS

Set finite positive integer values only after verifying the SyrianFatora quota and expected legitimate use. No default or guessed quota is embedded in the code. Missing or invalid values cause the limiter to fail closed with HTTP 503.

Set the secret RATE_LIMIT_HMAC_SECRET on both Workers to the exact same random value of at least 32 bytes. It is used only to derive HMAC-SHA-256 identities; raw API keys, IP addresses and OAuth grant subjects are not stored as limiter identifiers. Never commit the secret.

The Preview configuration intentionally does not bind a production limiter. Preview requests that reach an upstream call fail closed; do not connect Preview to production quota or customer data.

## SyrianFatora provider quota reference

The official developer documentation states a default daily quota of 1,000 successful requests per workspace, which can be increased on request. Paid plans add a monthly quota measured by the billing cycle; the public documentation does not publish one universal monthly number. Responses include X-RateLimit-Limit and X-RateLimit-Remaining, and 429 responses include Retry-After.

Source: https://syrianfatora.com/developers

Configure RATE_LIMIT_CREDENTIAL_MAX_REQUESTS to the confirmed workspace daily allowance and RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS to the chosen conservative local guard window. The current coordinator is keyed by API-key fingerprint. Because the provider describes its quota as workspace-wide, multiple API keys belonging to one workspace would currently receive separate local counters. Production use therefore requires confirming one API key per workspace or obtaining a stable workspace identifier from the provider and changing the limiter identity.
