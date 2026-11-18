# Rate-limiter audit — PR #14

**Status:** Source/configuration audit expanded; focused client tests and both package build/test workflows passed.
**Scope:** OAuth authorization Worker, MCP resource Worker, shared Durable Object coordinator.
**Production impact:** None. This branch does not change production Cloudflare resources, DNS, or deployments.

## Verified source observations

1. `apps/auth/src/rate-limit.mjs` exports `CredentialRateLimiter`, a Durable Object backed by SQLite tables `rate_events` and `rate_cooldowns`.
2. `_consume()` wraps cooldown inspection, event cleanup, bucket counts, and event inserts in `ctx.storage.transactionSync()`. It checks all supplied buckets before inserting any accepted event, which avoids charging an earlier bucket when a later bucket rejects.
3. The current strict quota bucket is named `credential` and the caller derives its Durable Object identity from an HMAC fingerprint of the submitted API key. This shares quota across grants using the same API key, but **does not aggregate distinct API keys for one SyrianFatora workspace**.
4. `consumeProxy()` checks the per-grant bucket and the credential bucket together. `consumeValidation()` checks the authorization credential-attempt bucket and the same credential bucket.
5. `apps/auth/src/rate-limit-client.mjs` requires a 32-byte HMAC secret and a Cloudflare client IP for authorization attempts. Missing bindings, missing secret, missing IP, and coordinator errors fail closed with 503; explicit quota decisions return 429.
6. `apps/auth/src/index.mjs` invokes `enforceAuthorizationRateLimit()` before `validateSyrianFatoraKey()` on approval.
8. `apps/mcp/src/handler.mjs` requires the `rateLimit` callback and invokes it immediately before its sole upstream `fetchImpl` call. Missing callback, denied quota, or callback failure stops the upstream request (503/429). If upstream returns 429, the handler requires the cooldown callback to succeed; otherwise it returns 503. No automatic retry is performed.
9. Both `apps/auth/cloudflare.config.ts` and `apps/mcp/cloudflare.config.ts` bind `RATE_LIMITER` to Worker `syrianfatora-auth`, export `CredentialRateLimiter`. Auth owns the Durable Object export with SQLite storage; MCP uses a cross-Worker Durable Object binding to that same Worker/export. Auth also binds its own namespace to the same export. This is the intended shared namespace topology in source configuration.
10. The `RATE_LIMITER` binding is omitted from both preview configurations (`isPreview` branch). Since both clients fail closed when the binding is missing, preview authorization and MCP upstream calls that reach the limiter will return 503. This is a known preview limitation, not a production bypass.
11. `RATE_LIMIT_HMAC_SECRET` is read by both Workers but is not declared as a plaintext config binding. It must be provisioned as a secret in both Workers with identical bytes. The repository does not prove that production secrets are present or equal; verify that operationally without exposing their values.
8. No provider-confirmed stable workspace identifier is currently evidenced by the supplied API documentation or the observed test responses. Do not infer workspace identity from the grant subject; it is generated per grant.

## Required verification before production

- Confirm the `cf/config` generated Durable Object migration metadata in the built artifacts; no hand-written Wrangler migration file exists in this repository.
- Verify that the production `RATE_LIMIT_HMAC_SECRET` secret is provisioned identically in Auth and MCP, without printing or copying the secret.
- Add direct tests for Durable Object atomic multi-bucket rejection and true concurrent consumption; current client tests mock the Durable Object namespace and do not prove SQLite transaction behavior.
- Verify production binding resolution and configured rate-limit values through a read-only operational inspection. Do not expose secret values or invent thresholds.
- Re-run both package build checks and test suites whenever rate-limit implementation code changes; the focused-test commit has already passed both workflows (see CI evidence below).
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


## GitHub Actions results

For commit `23f6bb96483d40dcc3e332c4b8889dd884f20dda` (the code/test changes; later commits only update documentation):

- MCP Resource Worker tests: run #59, conclusion **success**. Dependency install, `npm run build:check`, and `npm test` all completed successfully.
- Auth Worker tests: run #74, conclusion **success**. Dependency install, `npm run build:check`, and `npm test` all completed successfully.
- These runs validate the new client-level tests and package builds. They do not validate live Cloudflare bindings, deployed secret parity, Durable Object SQLite concurrency, or production quota values.


## PR #14 status before merge

### Completed and evidenced in this PR

- [x] Source audit of the SQLite-backed `CredentialRateLimiter`, including its event/cooldown tables and `transactionSync()` transaction boundary.
- [x] Source audit of Auth approval ordering: rate-limit enforcement runs before upstream API-key validation.
- [x] Source audit of the MCP handler: its upstream fetch is gated; missing/failed limiter blocks the call; upstream 429 cooldown recording is required; no automatic retry is performed.
- [x] Source configuration audit: Auth owns `CredentialRateLimiter`; Auth and MCP production configurations reference the same class through the cross-Worker Durable Object binding.
- [x] Documented preview behavior: preview omits `RATE_LIMITER`, so protected operations fail closed with 503 rather than reaching upstream.
- [x] Added client-level Auth and MCP tests for allowed/denied decisions, identity derivation, cooldown recording, invalid identity, and missing configuration.
- [x] GitHub Actions passed on code/test commit `23f6bb96483d40dcc3e332c4b8889dd884f20dda`: MCP run #59 and Auth run #74 each passed dependency installation, `npm run build:check`, and `npm test`.
- [x] Updated the audit, architecture, security, implementation-plan, and production-migration documentation to reflect source findings and known limitations.
- [x] Confirmed PR #14 remains open and Draft; no production deployment, DNS change, or Cloudflare resource mutation was performed.

### Not completed — required before production enablement

- [ ] Add direct tests against `CredentialRateLimiter` for concurrent requests, transaction atomicity, and the guarantee that a rejected multi-bucket request charges no bucket.
- [ ] Inspect the generated `cf/config` Durable Object migration metadata in the actual build output and record the migration tag/class details.
- [ ] Verify deployed production Durable Object binding resolution for both Workers using read-only Cloudflare inspection.
- [ ] Verify that `RATE_LIMIT_HMAC_SECRET` exists in both production Workers and is byte-identical. Do not display, copy, or log either value.
- [ ] Obtain and record the actual workspace daily quota and applicable monthly plan quota; configure finite limits from those confirmed values. No production thresholds have been selected by this PR.
- [ ] Resolve the identity limitation: distinct API keys for one workspace currently receive distinct local quota identities. Before claiming workspace-wide local enforcement, either enforce one active API key per workspace or obtain a provider-issued stable workspace identifier.
- [ ] Run a safe Preview validation after configuring a test-only Durable Object binding/namespace; current Preview intentionally fails closed because the binding is omitted. Never point Preview tests at a real customer workspace.
- [ ] Re-run CI after any code changes made to satisfy the above tests or configuration requirements.

### Explicit non-goals / not performed

- No production deployment or Worker upload.
- No DNS, custom-domain, route, or live binding changes.
- No secret creation, rotation, or inspection that reveals secret contents.
- No real-workspace write-operation tests.
- No merge of PR #14.

**Merge recommendation:** Keep this PR Draft until the code-level atomicity/concurrency tests and generated migration metadata review are complete. Production enablement must remain blocked until the operational secret, binding, and provider-quota checks are verified. The workspace identity limitation must be accepted explicitly or resolved before describing the local quota as workspace-wide.
