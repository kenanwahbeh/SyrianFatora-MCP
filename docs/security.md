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

- Collect the upstream key only on the first-party HTTPS authorization page.
- Validate credentials with the harmless read-only `GET /customers?per_page=1` endpoint.
- Validation requires `customers.read`; a 403 is not automatically an invalid key.
- The validation endpoint is fixed to `https://syrianfatora.com/api/public/v1/customers?per_page=1`; redirects are rejected.
- Never place credentials in URL parameters, analytics, logs, error traces, browser local storage, hidden form fields, or plugin configuration.
- Do not create a separate plaintext KV record for the API key.
- Implement a disconnect/revoke action that invalidates OAuth grants and deletes or invalidates the associated upstream credential. This UX is still outstanding.

## Rate limiting and SyrianFatora quota protection

Rate limiting is a **mandatory production release gate**, not an optional hardening item. Every approval POST that can reach `validateSyrianFatoraKey` consumes upstream quota, and every MCP tool call that proxies to SyrianFatora consumes upstream API capacity.

### Required enforcement points

1. **Authorization approval:** apply a rate-limit decision before calling `validateSyrianFatoraKey`. Denied attempts must not call SyrianFatora. Protect both the client/IP attempt rate and repeated attempts using the submitted credential fingerprint; never use or store the raw API key as a limiter key.
2. **MCP upstream proxy:** apply a rate-limit decision before every upstream fetch. Key the strict quota budget by a keyed fingerprint of the upstream API credential so multiple OAuth grants for the same workspace cannot multiply its allowance. Add a per-grant budget to contain a single client's burst.
3. **Fail closed:** if the strict limiter is unavailable or cannot determine whether the request is within budget, do not call SyrianFatora. Return a controlled 429 or 503 with `Retry-After` where appropriate.
4. **Upstream feedback:** honor SyrianFatora 429 responses and `Retry-After`; do not automatically retry quota-exhausting requests. Add a per-credential cooldown/circuit breaker after upstream 429 responses.
5. **No secret leakage:** derive credential fingerprints using a server-side keyed HMAC; never log the key or persist the raw key in limiter storage.

### Control design and accuracy

- Cloudflare Workers Rate Limiting bindings may provide a fast edge gate for IP-level authorization attempts and per-grant burst protection. Their counters are approximate and local to each Cloudflare location; they are **not** a strict global or per-workspace quota control.
- A Durable Object keyed by the keyed credential fingerprint is the required strict shared coordinator for each upstream SyrianFatora credential. It must atomically check and charge the credential budget before allowing a proxy call, coordinate concurrent requests, and persist the rolling/window counter and cooldown state.
- Set finite thresholds from the actual SyrianFatora API quota and expected legitimate client usage. Do not invent provider limits. If the upstream quota is unknown, use conservative configurable caps and obtain an explicit reviewed budget before production enablement; do not ship with an unlimited or disabled limiter.
- The same credential-level budget must cover both `validateSyrianFatoraKey` and all MCP upstream calls. Keep authorization-attempt/IP limits as an additional abuse control, not a substitute for credential-level quota accounting. The current identity is a keyed API-key fingerprint: it unifies grants that use the same key, but does not aggregate different keys belonging to one workspace.

### Current implementation status

The source now enforces these gates: the authorization approval POST passes IP and credential-attempt checks plus the shared credential budget before validateSyrianFatoraKey; every MCP upstream fetch passes the same credential budget and a per-grant burst window. The coordinator is a SQLite-backed Durable Object exported by the authorization Worker and bound into the MCP Worker. Counters use sliding windows and keyed HMAC identities; raw API keys, IP addresses and grant subjects are not stored by the limiter.

This is source implementation, not production verification. Finite thresholds are mandatory runtime configuration and have not been invented; missing configuration or an unavailable coordinator fails closed. Both production configs point at the same Durable Object class. Preview omits the limiter binding and therefore fails closed for upstream calls. Production rollout remains blocked until the actual SyrianFatora quota is confirmed, identical HMAC secrets are installed on both Workers, the runtime configuration is set, generated migration metadata and deployed bindings are verified, and direct Durable Object atomicity/concurrency tests are completed.

## Production migration safeguards

- Keep the production resource Worker name exactly `syrianfatora-mcp`.
- Deploy the authorization Worker as a separate internal dependency; do not replace the MCP Worker with it.
- Capture the exact live MCP script, settings, bindings, versions, and deployment metadata before any overwrite.
- Never use `--force` solely to bypass a script API conflict without verifying the complete replacement artifact and rollback.
- Never use a real production workspace for write-operation smoke tests.
- Limit smoke tests to health, OAuth metadata/discovery, MCP initialize, tools/list, invalid-token rejection, and safe read-only upstream requests.
- Set request size limits, no-store response headers for sensitive endpoints, and conservative CORS/Content Security Policy.
- Enforce the mandatory authorization and MCP upstream rate-limit gates described above before production traffic is enabled.
- Redact sensitive headers, query strings, and authorization form bodies in observability.

## Testing exception

PR #14 adds focused Node tests for the Auth and MCP rate-limit clients. Both GitHub Actions workflows passed for code/test commit `23f6bb96483d40dcc3e332c4b8889dd884f20dda`: Auth run #74 and MCP run #59 each passed dependency installation, `npm run build:check`, and `npm test`. The tests mock the Durable Object namespace and do not prove SQLite atomicity or real concurrent consumption. These client tests mock the Durable Object namespace and do not prove SQLite transaction atomicity or real concurrent consumption. Direct Durable Object tests and production read-only configuration verification remain release gates. No production write-operation tests are allowed.

## Incident response

If a key is exposed, revoke it in SyrianFatora, invalidate related OAuth grants, rotate affected signing/encryption material as appropriate, and inspect redacted audit events. Never recover or print exposed secrets from logs.

## Upstream quota facts and identity caveat

SyrianFatora's official developer documentation specifies a default daily quota of 1,000 requests per workspace, which can be increased on request. The documentation says requests, including 429 responses, are recorded in workspace usage/audit logs; this audit-log statement should not be interpreted as proof that every 429 consumes the daily allowance. Paid plans add a monthly quota tied to the billing cycle; the public documentation does not specify one universal monthly value. Responses expose X-RateLimit-Limit and X-RateLimit-Remaining, and 429 responses expose Retry-After. Source: https://syrianfatora.com/developers

The implementation currently coordinates usage by keyed API-credential fingerprint. This strictly shares usage across OAuth grants using the same key, but it does not merge multiple distinct API keys belonging to one workspace. Since the upstream quota is workspace-wide, production rollout must either enforce one active API key per workspace or obtain a stable workspace identifier from SyrianFatora and key the shared quota by that identity. Monthly plan limits remain enforced by the upstream provider; local cooldown handling honors its 429 Retry-After.
