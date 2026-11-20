# Rate-limiter audit — provider-owned workspace quota

**Updated:** 2026-11-20

**Scope:** Auth authorization-attempt protection, MCP upstream requests, provider-directed cooldown behavior.
**Intent:** SyrianFatora owns workspace quota. This integration must not create a competing local request quota.

## Current behavior in source

1. The Auth approval path applies IP-attempt and credential-fingerprint attempt protection before calling the read-only SyrianFatora API-key validation endpoint.
2. These counters protect repeated authorization submissions only. They are not applied to normal MCP tool calls.
3. The MCP Worker no longer charges a per-credential request bucket or a per-OAuth-grant bucket.
4. The MCP Worker checks only whether a credential-scoped provider cooldown is active before forwarding an upstream request.
5. A cooldown is recorded only after SyrianFatora returns HTTP 429 with a valid Retry-After header. The provider-specified duration is used; no local fallback is configured.
6. If Retry-After is missing or invalid, no cooldown is created.
7. The handler does not automatically retry an upstream request.
8. Provider X-RateLimit-Limit, X-RateLimit-Remaining, and Retry-After values are passed through in the MCP tool result when present.
9. The HMAC API-key fingerprint is used for privacy-preserving authorization-attempt identity and provider-directed cooldown storage. It is not a workspace ID and is not used to meter normal API requests.
10. The random OAuth grant subject is not used for quota accounting.

## Controls retained

- Authorization IP attempt window.
- Authorization credential-validation attempt window.
- Provider-directed 429 cooldown state only.

## Controls removed

- Local per-credential MCP request quota.
- Local per-OAuth-grant MCP request quota.
- Local daily or monthly usage caps.
- The local fallback cooldown duration.
- Any requirement to discover or infer a stable workspace identifier for local quota aggregation.

## Configuration inventory

The remaining authorization-attempt settings are:
- RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS
- RATE_LIMIT_AUTH_IP_WINDOW_SECONDS
- RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS
- RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS

RATE_LIMIT_HMAC_SECRET remains required for privacy-preserving credential/IP identities. There are no RATE_LIMIT_CREDENTIAL_MAX_REQUESTS, RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS, RATE_LIMIT_GRANT_MAX_REQUESTS, RATE_LIMIT_GRANT_WINDOW_SECONDS, or RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS settings.

## Tests

The source tests cover concurrent authorization-attempt protection in the SQLite Durable Object; credential-attempt protection without a second credential usage bucket; provider-directed cooldown behavior; MCP cooldown checks without grant fingerprints or local usage charges; missing secret/binding failure behavior; handler behavior when provider cooldown is active; and provider quota headers/upstream 429 handling.

On `main`, the Auth suite passes 41/41 and the MCP suite passes 21/21; the Cloudflare Build workflows run audit, build, and test gates. These source tests do not prove a real Workspace-key OAuth flow or authenticated MCP tool call; see the production migration log and the ordered release gates.

## Production safety

- The Auth and MCP Workers are deployed with the provider-owned quota model. Production binding/secret inventory and read-only endpoint checks are recorded in `docs/production-migration.md`.
- The 2026-11-20 Auth release passed 41/41 tests; the current `main` MCP suite passes 21/21. The rate-limiter behavior is source-tested and the production bindings are verified.
- Do not introduce local per-key, per-grant, daily, or monthly request quotas. Production write-operation tests remain prohibited.
- Never test write operations against a real customer workspace.
