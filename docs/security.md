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
- Never use `--force` solely to bypass a script API conflict without verifying the complete replacement artifact and rollback.
- Never use a real production workspace for write-operation smoke tests.
- Limit smoke tests to health, OAuth metadata/discovery, MCP initialize, tools/list, invalid-token rejection, and safe read-only upstream requests.
- Set request size limits, no-store response headers for sensitive endpoints, and conservative CORS/Content Security Policy.
- Verify the authorization-attempt abuse guard and provider-directed 429 cooldown bindings before production traffic is enabled. Do not add local request quotas to MCP traffic.
- Redact sensitive headers, query strings, and authorization form bodies in observability.

## Testing exception

PR #14 adds focused Node tests for the Auth and MCP rate-limit clients. Both GitHub Actions workflows passed for code/test commit `23f6bb96483d40dcc3e332c4b8889dd884f20dda`: Auth run #74 and MCP run #59 each passed dependency installation, `npm run build:check`, and `npm test`. The tests mock the Durable Object namespace and do not prove SQLite atomicity or real concurrent consumption. These client tests mock the Durable Object namespace and do not prove SQLite transaction atomicity or real concurrent consumption. Direct Durable Object tests and production read-only configuration verification remain release gates. No production write-operation tests are allowed.

## Incident response

If a key is exposed, revoke it in SyrianFatora, invalidate related OAuth grants, rotate affected signing/encryption material as appropriate, and inspect redacted audit events. Never recover or print exposed secrets from logs.

## Upstream quota facts and identity caveat

SyrianFatora's official developer documentation specifies a default daily quota of 1,000 requests per workspace, which can be increased on request. The documentation says requests, including 429 responses, are recorded in workspace usage/audit logs; this audit-log statement should not be interpreted as proof that every 429 consumes the daily allowance. Paid plans add a monthly quota tied to the billing cycle; the public documentation does not specify one universal monthly value. Responses expose X-RateLimit-Limit and X-RateLimit-Remaining, and 429 responses expose Retry-After. Source: https://syrianfatora.com/developers

The implementation currently coordinates usage by keyed API-credential fingerprint. This strictly shares usage across OAuth grants using the same key, but it does not merge multiple distinct API keys belonging to one workspace. Since the upstream quota is workspace-wide, production rollout must either enforce one active API key per workspace or obtain a stable workspace identifier from SyrianFatora and key the shared quota by that identity. Monthly plan limits remain enforced by the upstream provider; local cooldown handling honors its 429 Retry-After.
