# Rate-limiter audit — provider-owned Workspace quota

**Updated:** 2026-11-21

## Implemented behavior

1. The Auth approval path applies IP-attempt and credential-fingerprint attempt protection before validating a submitted Workspace API key.
2. These counters protect authorization submissions only; they are not applied to normal MCP tool calls.
3. The MCP Worker does not charge a per-credential or per-OAuth-grant request bucket.
4. Before forwarding an upstream request, MCP checks whether a credential-scoped provider cooldown is active.
5. A cooldown is recorded only after SyrianFatora returns HTTP 429 with a valid `Retry-After`.
6. The cooldown uses the provider-specified duration. There is no local fallback duration.
7. The handler does not automatically retry an upstream request.
8. Provider `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `Retry-After` values are preserved in MCP tool results when present.
9. The HMAC credential fingerprint is used for privacy-preserving authorization protection and provider-directed cooldown storage. It is not a Workspace ID and is not used to meter API requests.
10. The random OAuth grant subject is not used for quota accounting.

## Controls retained

- Authorization IP attempt window.
- Authorization credential-validation attempt window.
- Provider-directed 429 cooldown state only.

## Controls explicitly not implemented

- Local per-credential MCP request quota.
- Local per-OAuth-grant MCP request quota.
- Local daily or monthly usage caps.
- Locally invented fallback cooldown duration.
- Workspace identity inference for quota aggregation.

## Configuration

Auth authorization-attempt settings:

- `RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS`
- `RATE_LIMIT_AUTH_IP_WINDOW_SECONDS`
- `RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS`
- `RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS`

`RATE_LIMIT_HMAC_SECRET` is required for privacy-preserving credential/IP identities. The MCP source does not define local request-quota settings such as `RATE_LIMIT_CREDENTIAL_MAX_REQUESTS`, `RATE_LIMIT_GRANT_MAX_REQUESTS` or `RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS`.

## Test and deployment evidence

The successful MCP v16 Cloudflare Build on 2026-11-21 ran 53 MCP tests after audit and build checks. Auth tests run in a separate package/workflow; the last documented Auth suite count is 43. Do not attribute the MCP Build result to Auth.

Cloudflare confirmed the production MCP `RATE_LIMITER` binding points to `CredentialRateLimiter` in `syrianfatora-auth`. The post-v16 authenticated MCP smoke remains outstanding.

## Safety

Do not introduce local per-key, per-grant, daily or monthly request quotas. Do not store raw keys/IP addresses/grant subjects. Do not automatically retry or invent a cooldown when the provider has not supplied a valid `Retry-After`.
