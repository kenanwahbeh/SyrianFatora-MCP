# SyrianFatora OAuth Authorization Worker

This is the separate OAuth 2.1 authorization server for the existing `syrianfatora-mcp` resource Worker. It does not replace the MCP service or expose a second MCP endpoint.

## Production identity

- Cloudflare Worker: `syrianfatora-auth`.
- Current production version: #6 `2f25855b-9299-47a1-88f6-65bf04f48da9`; deployment `34b83009-a63b-418b-ace6-a9365ad70cf3` (100% traffic).
- Immediate rollback version: #5 `53dfd48f-5b83-49f9-bd8a-229255d82790`; deployment `d66496cb-7e13-48a4-8c4d-433c8dfd560d`.
- Issuer: https://syrianfatora-auth.kinan-api.workers.dev.
- Service Binding entrypoint: `SyrianFatoraAuth`.
- The existing `syrianfatora-mcp` Worker calls it internally through `AUTH_SERVER`.
- Production workers.dev route is enabled; public version-preview URLs are disabled.

## Current implementation

- Uses `@cloudflare/workers-oauth-provider@1.2.4` (pinned).
- Implements Authorization Code + PKCE.
- Supports Client ID Metadata Documents and Dynamic Client Registration for compatible clients.
- Provides a first-party authorization page that displays the requesting client, publisher information, redirect host, and requested scopes.
- Collects the SyrianFatora workspace API key only over the HTTPS form POST.
- Validates the key with the read-only `GET /customers?per_page=1` endpoint.
- Requires the upstream key to have `customers.read` permission and API access enabled.
- Uses possession of the workspace API key as the initial proof of workspace access; it does not claim to authenticate a person's legal identity.
- Passes the upstream key only in provider-encrypted `props`; it is never returned to the MCP client.
- Exposes a minimal `/health` endpoint and OAuth authorization-server discovery.

## Production runtime configuration

| Setting | Production value / purpose |
| --- | --- |
| Worker name | `syrianfatora-auth` |
| `ISSUER` | `https://syrianfatora-auth.kinan-api.workers.dev` |
| `MCP_SERVER_URL` | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| `OAUTH_KV` | Production namespace `d19d9bd755c349f688cd55e299b8168f` |
| `RATE_LIMITER` | SQLite Durable Object `CredentialRateLimiter`, namespace `1303fb3e6d25453080035c0356b4d4bd` |
| `RATE_LIMIT_HMAC_SECRET` | Secret text; same random 48-byte value on Auth and MCP |
| `ACCESS_TOKEN_TTL_SECONDS` | `3600` |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` |
| `CLIENT_REGISTRATION_TTL_SECONDS` | `7776000` |

The Worker uses compatibility flags `nodejs_compat` and `global_fetch_strictly_public`. Do not deploy with `.invalid` URLs or placeholder KV IDs.

## Authorization abuse protection

The approval POST applies two narrow protections before validating a submitted API key:

- IP attempt window: 7 attempts per 60 seconds.
- Repeated credential-fingerprint window: 2 attempts per 60 seconds.

These controls protect the authorization form from abuse only. They do not meter normal MCP requests and are not a substitute for SyrianFatora workspace quota enforcement.

Do not add per-credential API request quotas or per-OAuth-grant request quotas. SyrianFatora is authoritative for workspace usage and quota. The Durable Object remains for authorization-attempt protection and provider-directed 429 cooldown state only.

## Security and verification

- Never place a real API key in source control, an issue, a test fixture, or a chat message.
- The validation call is read-only but consumes SyrianFatora API quota.
- A 403 from validation means the key lacks `customers.read` or API access is disabled; do not misreport it as an invalid key.
- The provider encrypts authorization `props`; the resource Worker must not log or expose `props.upstreamApiKey`.
- The random OAuth subject identifies a grant, not a verified human identity or SyrianFatora workspace ID.
- Credential replacement and disconnect/revocation UX are not implemented yet. Reauthorizing creates an independent grant; revoke the previous refresh token before replacing a key.
- Auth v6 currently has a refresh-token consent mismatch: refresh tokens may be issued even when `offline_access` was not approved. The correction and lifecycle tests are in draft PR #54; it is not deployed.
- Live production smoke checks passed for `/health`, OAuth discovery, MCP protected-resource metadata, the MCP-to-Auth Service Binding, and rejection of an invalid bearer token with HTTP 401.
- **Real-key smoke verified:** the operator confirmed successful production OAuth Authorization Code + PKCE authorization with two real Workspace keys (`KEY_1` and `KEY_2`). Keys were entered only on the first-party HTTPS authorization page; the smoke used `mcp:read` and performed read-only MCP calls. Key values are not recorded.
- **Still outstanding:** refresh-token lifecycle behavior, revocation from the client/ChatGPT side, and user-facing disconnect/replacement UX. The Auth v6 `offline_access` mismatch remains tracked in draft PR #54.
- Auth CI on `main`: 41 tests pass, including SQLite Durable Object concurrency serialization and provider-directed 429 cooldown tests.
- `npm audit --audit-level=high` currently reports zero vulnerabilities; the CI and Cloudflare Build pipelines enforce this gate.

## Shared guard and secrets

The authorization Worker exports the SQLite-backed `CredentialRateLimiter` Durable Object. It stores only authorization IP/credential-attempt events and provider-directed 429 cooldown state. It does not count normal MCP requests or enforce a local API quota.

Required authorization-attempt variables:
- `RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS`
- `RATE_LIMIT_AUTH_IP_WINDOW_SECONDS`
- `RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS`
- `RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS`

Set `RATE_LIMIT_HMAC_SECRET` on both Workers to the same random value of at least 32 bytes. The production value is 48 bytes. The HMAC is used for privacy-preserving credential identities; never commit the secret or store raw API keys/IP addresses in limiter records.

A cooldown is stored only when SyrianFatora returns a valid `Retry-After` header. Its duration is taken from that header. There is no local fallback cooldown. If the provider omits or supplies an invalid header, no local cooldown is created.

## Preview deployment

The isolated Preview Worker is separate from production and remains pinned to the `test/durable-object-atomicity` branch. The production Worker Build trigger targets `main` and deploys only the production Worker. Public version-preview URLs are disabled for the production issuer.
