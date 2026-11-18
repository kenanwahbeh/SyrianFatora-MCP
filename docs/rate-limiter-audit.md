# Rate-limiter audit — PR #14

**Status:** Initial source audit; implementation and runtime verification are pending.
**Scope:** OAuth authorization Worker, MCP resource Worker, shared Durable Object coordinator.
**Production impact:** None. This branch does not change production Cloudflare resources, DNS, or deployments.

## Verified source observations

1. `apps/auth/src/rate-limit.mjs` exports `CredentialRateLimiter`, a Durable Object backed by SQLite tables `rate_events` and `rate_cooldowns`.
2. `_consume()` wraps cooldown inspection, event cleanup, bucket counts, and event inserts in `ctx.storage.transactionSync()`. It checks all supplied buckets before inserting any accepted event, which avoids charging an earlier bucket when a later bucket rejects.
3. The current strict quota bucket is named `credential` and the caller derives its Durable Object identity from an HMAC fingerprint of the submitted API key. This shares quota across grants using the same API key, but **does not aggregate distinct API keys for one SyrianFatora workspace**.
4. `consumeProxy()` checks the per-grant bucket and the credential bucket together. `consumeValidation()` checks the authorization credential-attempt bucket and the same credential bucket.
5. `apps/auth/src/rate-limit-client.mjs` requires a 32-byte HMAC secret and a Cloudflare client IP for authorization attempts. Missing bindings, missing secret, missing IP, and coordinator errors fail closed with 503; explicit quota decisions return 429.
6. `apps/auth/src/index.mjs` invokes `enforceAuthorizationRateLimit()` before `validateSyrianFatoraKey()` on approval.
7. The MCP handler accepts an injected `rateLimit` callback and an upstream-429 callback. The full worker entrypoint and configuration must be checked to verify that every upstream fetch is gated and that both Workers resolve to the same Durable Object namespace/class.
8. No provider-confirmed stable workspace identifier is currently evidenced by the supplied API documentation or the observed test responses. Do not infer workspace identity from the grant subject; it is generated per grant.

## Required verification before production

- Verify the Durable Object class export, migration tag, namespace binding, and cross-Worker binding semantics for both Worker configurations.
- Verify that Auth and MCP call the same coordinator namespace and derive the same credential bucket identity.
- Add tests for atomic multi-bucket rejection, concurrent requests, cooldown behavior, malformed identity, missing configuration/binding, and coordinator failure.
- Prove that every upstream MCP fetch passes through the limiter and that upstream 429 / Retry-After is recorded without automatic retries.
- Confirm all required environment variables and configure values only from approved provider limits and operational policy. Do not invent thresholds.
- Run each package's build check and test suite; record exact commands and results.
- Keep the workspace-wide quota identity limitation explicit until SyrianFatora provides a stable workspace identifier or another verified mapping. Do not claim cross-key workspace aggregation.

## Configuration inventory (names observed in source)

- `RATE_LIMIT_HMAC_SECRET`
- `RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS`
- `RATE_LIMIT_AUTH_IP_WINDOW_SECONDS`
- `RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS`
- `RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS`
- `RATE_LIMIT_CREDENTIAL_MAX_REQUESTS`
- `RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS`
- `RATE_LIMIT_GRANT_MAX_REQUESTS`
- `RATE_LIMIT_GRANT_WINDOW_SECONDS`
- `RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS`

This is an inventory, not a production-ready value set. All values must be explicitly configured; no guessed production quotas are acceptable.
