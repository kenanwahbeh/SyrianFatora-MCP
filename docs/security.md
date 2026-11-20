# Security model and threat controls

## Secrets

- SyrianFatora API keys are user secrets and must remain server-side.
- OAuth signing/encryption keys are deployment secrets, not source files or plugin configuration.
- Access and refresh tokens must not reveal or encode the upstream API key.
- Never log Authorization headers, request bodies containing credentials, token values, or authorization codes.
- The authorization Worker passes the upstream API key only through Workers OAuth Provider's encrypted `props`; the MCP Worker treats `props` as sensitive and never logs or returns the key.

## OAuth requirements

- Authorization Code grant with PKCE `S256`.
- Exact redirect URI validation; reject wildcards and open redirects.
- Validate the provider's browser-bound consent handle before completing authorization.
- Consent page must show client name, publisher information when available, requested scopes, and redirect hostname.
- Validate audience and scopes on every MCP request.
- Use explicit token expiry, rotation/revocation strategy, and replay protections.
- Reject insecure HTTP origins except local development.

## Credential handling

The upstream API key is stored in provider-encrypted grant properties and returned only to the internal MCP resource Worker after successful token validation. Each authorization has a random, per-grant subject; the current read-only validation response does not provide a stable Workspace identifier, so reauthorization creates a separate grant rather than replacing an earlier one.

**Current lifecycle gap:** Auth v6 has a global refresh-token TTL, so it may issue refresh tokens even when the consent page's optional `offline_access` scope was not approved. Draft PR #54 adds a callback to issue refresh tokens only when the client requested and the user approved that scope. It also tests the distinction between access-token revocation and full refresh-token/grant revocation. This correction is not merged or deployed; do not use a real Workspace key until it is reviewed and the ordered gates are closed.

- Collect the upstream key only on the first-party HTTPS authorization page.
- Validate credentials with the harmless read-only `GET /customers?per_page=1` endpoint.
- Validation requires `customers.read`; a 403 is not automatically an invalid key.
- The validation endpoint is fixed to `https://syrianfatora.com/api/public/v1/customers?per_page=1`; redirects are rejected.
- Never place credentials in URL parameters, analytics, logs, error traces, browser local storage, hidden form fields, or plugin configuration.
- Do not create a separate plaintext KV record for the API key.
- Add a user-facing disconnect/replacement flow that invokes OAuth grant revocation and clearly handles the associated upstream credential. The provider-level revocation semantics exist, but this user-facing UX is still outstanding.

## Authorization abuse protection and provider quota

SyrianFatora alone owns workspace API quota enforcement. Do not impose a local per-credential request budget, per-OAuth-grant request budget, local daily cap, or local monthly cap. Normal MCP requests must not consume local counters or be rejected because of locally calculated usage.

The authorization endpoint retains two narrow anti-abuse controls before the read-only API-key validation request:
1. IP-based protection against repeated authorization submissions.
2. Credential-fingerprint protection against repeated key-validation attempts.

These are protections for repeated authorization attempts only. They are not workspace quota controls and must not be applied to normal MCP tool calls.

When SyrianFatora returns HTTP 429, the MCP Worker may store a cooldown for that credential only when the provider supplies a valid Retry-After value. The cooldown must use that exact provider-directed wait; do not add a local fallback or invent a duration. Do not automatically retry. If Retry-After is missing or invalid, do not create a local cooldown. Return the upstream 429 information to the MCP client.

The credential HMAC fingerprint remains only as a privacy-preserving key for authorization-attempt protection and provider-directed cooldown state. It is not a substitute for a workspace identifier and is not used to meter API usage. The random OAuth grant subject is not a workspace identity. Never store raw API keys, IP addresses, or grant subjects in limiter storage.

The SQLite Durable Object is retained only for authorization abuse protection and provider-directed 429 cooldown state. MCP requests do not increment `rate_events`; the MCP guard only checks whether a provider-directed cooldown is still active. No local request quota is created.

## Provider quota visibility

SyrianFatora response headers `X-RateLimit-Limit` and `X-RateLimit-Remaining`, together with its HTTP 429 and `Retry-After` response, are the source of truth for provider quota state. Preserve and expose provider quota information to the MCP client where available. Do not infer a workspace's quota from the number of API keys or OAuth grants.

## Production migration safeguards

- Keep the production resource Worker name exactly `syrianfatora-mcp`.
- Deploy the authorization Worker as a separate internal dependency; do not replace the MCP Worker with it.
- Capture the exact live MCP script, settings, bindings, versions, and deployment metadata before any overwrite.
- Never configure `--force` in an automatic CI or Cloudflare Build production trigger. A one-time migration exception requires separate explicit approval, a captured live baseline, a verified replacement artifact, and a documented rollback.
- Never use a real production workspace for write-operation smoke tests.
- Limit smoke tests to health, OAuth metadata/discovery, MCP initialize, tools/list, invalid-token rejection, and safe read-only upstream requests.
- Set request size limits, no-store response headers for sensitive endpoints, and conservative CORS/Content Security Policy.
- The authorization-attempt abuse guard and provider-directed 429 cooldown bindings are deployed and were verified in production; see the production migration log. Do not add local request quotas to MCP traffic.
- Redact sensitive headers, query strings, and authorization form bodies in observability.

## Testing and production evidence

The historical PR #14 test exception was superseded by the later SQLite-backed Durable Object test suite. On `main`, the Auth suite passes 41/41 tests, including concurrent authorization-attempt serialization; the MCP suite passes 24/24 tests. Both Cloudflare Build triggers run `npm audit --audit-level=high`, `npm run build:check`, and `node --test` before deployment. The current deployed Auth and MCP versions and their health/discovery probes are recorded in `docs/production-migration.md`.

A separate operator-confirmed production read-only OAuth smoke completed successfully with two real Workspace keys (`KEY_1` and `KEY_2`), using Authorization Code + PKCE, `mcp:read`, authenticated MCP initialization/tool discovery, and `customers_list` (`per_page=1`). This evidence does not verify refresh-token rotation, client-side revocation, or disconnect/replacement UX. Because gates 1–5 are not all formally closed, further real-key testing remains NO-GO. No production write-operation tests are allowed.

## Incident response

If a key is exposed, revoke it in SyrianFatora, invalidate related OAuth grants, rotate affected signing/encryption material as appropriate, and inspect redacted audit events. Never recover or print exposed secrets from logs.

## Upstream quota facts and identity caveat

SyrianFatora's official developer documentation specifies a default daily quota of 1,000 requests per workspace, which can be increased on request. The documentation says requests, including 429 responses, are recorded in workspace usage/audit logs; this audit-log statement should not be interpreted as proof that every 429 consumes the daily allowance. Paid plans add a monthly quota tied to the billing cycle; the public documentation does not specify one universal monthly value. Responses expose X-RateLimit-Limit and X-RateLimit-Remaining, and 429 responses expose Retry-After. Source: https://syrianfatora.com/developers

The implementation does not coordinate or meter workspace usage locally. The HMAC credential fingerprint is used only for authorization-attempt protection and provider-directed cooldown state; it does not merge distinct API keys into a workspace identity. No local workspace aggregation is needed because SyrianFatora remains the sole quota authority. Monthly plan limits remain provider-enforced, and local cooldown handling honors only a valid provider `Retry-After`.
