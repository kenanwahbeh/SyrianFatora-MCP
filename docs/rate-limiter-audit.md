# Rate-limiter audit — PR #14

**Status:** Source/configuration audit expanded; focused client tests added. Latest test run for the added tests is pending.
**Scope:** OAuth authorization Worker, MCP resource Worker, shared Durable Object coordinator.
**Production impact:** None. This branch does not change production Cloudflare resources, DNS, or deployments.

## Verified source observations

1. `apps/auth/src/rate-limit.mjs` exports `CredentialRateLimiter`, a Durable Object backed by SQLite tables `rate_events` and `rate_cooldowns`.
2. `_consume()` wraps cooldown inspection, event cleanup, bucket counts, and event inserts in `ctx.storage.transactionSync()`. It checks all supplied buckets before inserting any accepted event, which avoids charging an earlier bucket when a later bucket rejects.
3. The current strict quota bucket is named `credential` and the caller derives its Durable Object identity from an HMAC fingerprint of the submitted API key. This shares quota across grants using the same API key, but **does not aggregate distinct API keys for one SyrianFatora workspace**.
4. `consumeProxy()` checks the per-grant bucket and the credential bucket together. `consumeValidation()` checks the authorization credential-attempt bucket and the same credential bucket.
5. `apps/auth/src/rate-limit-client.mjs` requires a 32-byte HMAC secret and a Cloudflare client IP for authorization attempts. Missing bindings, missing secret, missing IP, and coordinator errors fail closed with 503; explicit quota decisions return 429.
6. `apps/auth/src/index.mjs` invokes `enforceAuthorizationRateLimit()` before `validateSyrianFatoraKey()` on approval.
7. `apps/mcp/src/handler.mjs` requires the `rateLimit` callback and invokes it immediately before its sole upstream `fetchImpl` call. Missing callback, denied quota, or callback failure stops the upstream request (503/429). If upstream returns 429, the handler requires the cooldown callback to succeed; otherwise it returns 503. No automatic retry is performed.
9. Both `apps/auth/cloudflare.config.ts` and `apps/mcp/cloudflare.config.ts` bind `RATE_LIMITER` to Worker `syrianfatora-auth`, export `CredentialRateLimiter`. Auth owns the Durable Object export with SQLite storage; MCP uses a cross-Worker Durable Object binding to that same Worker/export. Auth also binds its own namespace to the same export. This is the intended shared namespace topology in source configuration.
10. The `RATE_LIMITER` binding is omitted from both preview configurations (`isPreview` branch). Since both clients fail closed when the binding is missing, preview authorization and MCP upstream calls that reach the limiter will return 503. This is a known preview limitation, not a production bypass.
11. `RATE_LIMIT_HMAC_SECRET` is read by both Workers but is not declared as a plaintext config binding. It must be provisioned as a secret in both Workers with identical bytes. The repository does not prove that production secrets are present or equal; verify that operationally without exposing their values.
8. No provider-confirmed stable workspace identifier is currently evidenced by the supplied API documentation or the observed test responses. Do not infer workspace identity from the grant subject; it is generated per grant.

## Required verification before production

- Confirm the `cf/config` generated Durable Object migration metadata in the built artifacts; no hand-written Wrangler migration file exists in this repository.
- Verify that the production `RATE_LIMIT_HMAC_SECRET` secret is provisioned identically in Auth and MCP, without printing or copying the secret.
- Add direct tests for Durable Object atomic multi-bucket rejection and true concurrent consumption; current client tests mock the Durable Object namespace and do not prove SQLite transaction behavior.
- Verify production binding resolution and configured rate-limit values through a read-only operational inspection. Do not expose secret values or invent thresholds.
- Run both package build checks and complete test suites after the latest test additions; record exact workflow results.
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


## Configuration and test evidence

- Auth Durable Object export: `CredentialRateLimiter`, SQLite storage, configured in `apps/auth/cloudflare.config.ts`.
- Auth and MCP production configurations both target `syrianfatora-auth` / `CredentialRateLimiter`; the MCP binding is cross-Worker. This confirms source-level topology, not the deployed production binding state.
- Preview omits the rate-limiter binding in both Workers and therefore intentionally fails closed for rate-limited operations.
- The HMAC secret is read in both packages and must be byte-identical across the two Workers. Secret parity is not verifiable from repository source.
- New focused tests were added:
  - `apps/auth/test/rate-limit-client.test.mjs`
  - `apps/mcp/test/rate-limit-client.test.mjs`
- The initial PR commit's CI completed successfully for both packages, including build checks and existing tests. That run predates the new focused tests and must not be treated as validation of them.
