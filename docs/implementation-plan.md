# Implementation plan and acceptance criteria

## Agreed direction — 2026-11-18

Migrate the **existing production MCP Worker in place**. Keep its exact Cloudflare service name `syrianfatora-mcp`, public MCP identity, and 51-tool catalogue. Do not create a replacement MCP Worker. A separate `syrianfatora-auth` authorization Worker is required by Workers OAuth Provider v1 and connects to the existing MCP Worker through a Service Binding.

The user has directed that automated tests be deferred for this immediate migration. This is a testing exception, not a claim that tests passed. No production write-operation tests are allowed.

## Phase 0 — Existing state and build pipeline

- [x] GitHub repository and source-controlled OAuth implementation exist.
- [x] Existing legacy production Worker source is archived in the repository.
- [x] Cloudflare production service name identified as `syrianfatora-mcp`.
- [x] Current OAuth code merged to `main`.
- [x] Cloudflare Build Token issue resolved by user.
- [x] Build reached deployment stage; deployment aborted safely due Worker-name/script-API conflict.
- [ ] Record exact current live script, metadata, settings, bindings, version ID, and deployment ID as rollback baseline.
- [ ] Verify exact public MCP endpoint and account Worker subdomain.

## Phase 1 — Production topology and configuration

- [x] Decision: keep `syrianfatora-mcp` as the only MCP resource Worker.
- [x] Decision: use separate `syrianfatora-auth` OAuth authorization Worker.
- [x] Decision: connect auth and MCP through Service Binding `AUTH_SERVER` → `SyrianFatoraAuth`.
- [x] Decision: use OAuth Authorization Code + PKCE and `mcp:read` / `mcp:write`.
- [ ] Discover and record the exact production MCP URL and authorization issuer URL.
- [ ] Create production KV namespace and record its ID (ID is configuration metadata, not a secret).
- [ ] Update auth config to production Worker name, issuer, MCP URL, and KV binding.
- [ ] Update MCP config to exact existing Worker name `syrianfatora-mcp`, exact URLs, and Service Binding target `syrianfatora-auth`.
- [ ] Confirm Cloudflare build/deploy pipeline uses the intended Worker and cannot silently target a preview service.

## Phase 2 — Authorization Worker deployment

- [x] Authorization Worker source and HTTPS credential onboarding flow exist.
- [x] Provider package pinned to 1.2.4.
- [x] API key validation uses read-only `GET /customers?per_page=1`.
- [x] API key is passed through provider-encrypted grant `props`.
- [ ] Configure production `OAUTH_KV` namespace.
- [ ] Deploy `syrianfatora-auth` and record deployment/version ID.
- [ ] Verify `/health`, issuer metadata, registration/discovery endpoints, and authorization page over HTTPS.

## Phase 3 — In-place MCP resource migration

- [x] OAuth resource-server wrapper source exists.
- [x] Existing 51 tool definitions are retained in the OAuth handler.
- [x] `mcp:read` / `mcp:write` enforcement is implemented in source.
- [ ] Capture complete rollback artifact and metadata for the currently deployed `syrianfatora-mcp`.
- [ ] Deploy OAuth resource-server code to the existing `syrianfatora-mcp` service (same Worker name).
- [ ] Record the resulting deployment/version ID.
- [ ] Verify health, protected-resource metadata, invalid-token rejection, and MCP `initialize` / `tools/list`.
- [ ] Verify a harmless read-only call with an authorized test account.
- [ ] Confirm no duplicate public MCP Worker was created.

## Phase 4 — Client connection

- [ ] Update the existing ChatGPT connector/plugin configuration; do not create a duplicate.
- [ ] Point it to the verified existing MCP URL and OAuth discovery metadata.
- [ ] Remove legacy static Bearer-key instructions.
- [ ] Complete a real ChatGPT OAuth connection and record the observed result.

## Phase 5 — Rate limiting and upstream quota protection (production blocker)

- [ ] Add an authorization approval rate-limit gate before `validateSyrianFatoraKey`; denied attempts must never reach SyrianFatora.
- [ ] Add a per-IP/edge abuse gate and repeated credential-fingerprint attempt gate for `POST /authorize`.
- [ ] Add a strict per-credential quota coordinator shared by auth validation and MCP proxy calls, keyed by a server-side HMAC fingerprint of the upstream API key.
- [ ] Implement the strict coordinator with a Durable Object; atomically check and charge before every upstream request, including concurrent requests and requests from different Cloudflare locations.
- [ ] Add per-grant burst limits for MCP clients; do not rely on random grant IDs as the only quota identity.
- [ ] Fail closed if the strict limiter is unavailable; return controlled 429/503 responses and do not forward upstream.
- [ ] Honor SyrianFatora 429 and Retry-After; add per-credential cooldown/circuit breaker and disable automatic quota-exhausting retries.
- [ ] Set finite configurable thresholds using verified SyrianFatora quota information and legitimate usage assumptions; document values and rationale. No quota values are currently confirmed.
- [ ] Verify that multiple OAuth grants using the same upstream credential share one quota budget.
- [ ] Verify rate-limit rejection paths do not call the upstream API.

## Phase 6 — Credential lifecycle and follow-up hardening

- [ ] Implement credential replacement.
- [ ] Implement user disconnect and OAuth grant revocation.
- [ ] Confirm credential deletion/invalidation behavior and tenant isolation.
- [ ] Restore automated unit/integration/security tests before subsequent feature releases.
- [ ] Verify refresh-token behavior only if the client lifecycle requires it.

## Production safety and stop conditions

- Production rollout is blocked until rate limiting is implemented at both `POST /authorize` before credential validation and MCP before every upstream proxy call. Documentation alone is not enforcement.

- Never deploy `.invalid` placeholders.
- Never guess public URLs, Worker subdomains, or KV namespace IDs.
- Never use `--force` merely to bypass the script API conflict. First capture the live script and complete metadata, then verify the replacement and rollback path.
- Do not change DNS/custom domains unless a concrete need is established and the change is recorded.
- Do not run create/update/delete tool calls against a real customer workspace during smoke tests.
- Do not record secrets in this repository or conversation.
- If the deployed artifact, endpoint identity, or rollback target cannot be verified, stop before replacing the live MCP Worker.

## Testing exception

Automated tests are deferred for the immediate production migration at the user's direction. The implementation plan must not mark deferred tests as passed. Use read-only operational probes and record unverified runtime behavior. Testing becomes a release gate again for later feature work.

## Rate-limiting implementation

- [x] Add a shared SQLite Durable Object coordinator hosted by the authorization Worker.
- [x] Gate authorization approval before SyrianFatora key validation using IP and credential-attempt sliding windows.
- [x] Gate every MCP upstream fetch using the same credential-wide budget plus a per-grant sliding window.
- [x] Use keyed HMAC-SHA-256 identities; never persist raw credentials, IP addresses or grant subjects in limiter storage.
- [x] Fail closed when configuration or the coordinator is unavailable; return controlled 429/503 responses.
- [x] Record upstream 429 cooldowns and honor Retry-After without automatic retries.
- [ ] Confirm provider quota and configure finite runtime thresholds.
- [ ] Set the identical HMAC secret on both Workers.
- [ ] Run build checks and safe preview verification.
- [ ] Complete operational verification before production rollout.

The implementation is committed to source; the unchecked items remain production blockers.

## Provider quota confirmation

- [x] Confirmed from the official SyrianFatora developer documentation: default 1,000 successful requests per workspace per day; daily limit may be increased on request.
- [x] Confirmed paid plans add a monthly quota measured by billing cycle; no universal public numeric value is published.
- [x] Confirmed response headers X-RateLimit-Limit and X-RateLimit-Remaining and 429 Retry-After.
- [ ] Confirm this workspace's actual daily limit and plan-specific monthly quota.
- [ ] Confirm one API key per workspace, or obtain a stable workspace ID so multiple keys share one limiter identity.
- [ ] Decide whether to persist and expose provider quota headers for operational visibility.

Provider source: https://syrianfatora.com/developers
