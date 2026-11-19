# Implementation plan and acceptance criteria

## Agreed direction — 2026-11-18

Migrate the **existing production MCP Worker in place**. Keep its exact Cloudflare service name `syrianfatora-mcp`, public MCP identity, and 51-tool catalogue. Do not create a replacement MCP Worker. A separate `syrianfatora-auth` authorization Worker is required by Workers OAuth Provider v1 and connects to the existing MCP Worker through a Service Binding.

PR #14 adds focused Auth and MCP rate-limit client tests and both package CI workflows pass. Direct Durable Object SQLite atomicity/concurrency tests remain outstanding. No production write-operation tests are allowed.

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

## Phase 5 — Provider-owned workspace quota and authorization abuse protection

- [x] Remove local per-credential request quotas from normal MCP traffic.
- [x] Remove per-OAuth-grant sliding-window request quotas.
- [x] Keep IP-based protection against repeated authorization submissions.
- [x] Keep credential-fingerprint protection against repeated API-key validation attempts during authorization only.
- [x] Use the HMAC fingerprint only for authorization-attempt protection and provider-directed cooldown state; do not treat it as a workspace identity.
- [x] Check for an active cooldown before an MCP upstream call only when it was created from SyrianFatora's own 429 Retry-After response.
- [x] Do not invent a fallback cooldown when Retry-After is absent or invalid.
- [x] Do not automatically retry provider 429 responses.
- [ ] Verify the revised Auth and MCP builds/tests and inspect the final diff.
- [ ] Verify generated Durable Object migration metadata and the remaining production bindings/secrets before any production deployment.

SyrianFatora is the sole authority for workspace request quotas. The integration must not meter normal MCP requests locally or impose a competing daily/monthly/per-key/per-grant cap.

## Phase 6 — Credential lifecycle and follow-up hardening

- [ ] Implement credential replacement.
- [ ] Implement user disconnect and OAuth grant revocation.
- [ ] Confirm credential deletion/invalidation behavior and tenant isolation.
- [ ] Add direct Durable Object unit/integration tests for SQLite transaction atomicity and concurrent consumption before production enablement.
- [ ] Verify refresh-token behavior only if the client lifecycle requires it.

## Production safety and stop conditions

- Production rollout must verify the remaining authorization-attempt abuse guard and provider-directed 429 cooldown bindings. Normal MCP traffic must not be charged against a local request quota; SyrianFatora is the sole workspace quota authority.

- Never deploy `.invalid` placeholders.
- Never guess public URLs, Worker subdomains, or KV namespace IDs.
- Never use `--force` merely to bypass the script API conflict. First capture the live script and complete metadata, then verify the replacement and rollback path.
- Do not change DNS/custom domains unless a concrete need is established and the change is recorded.
- Do not run create/update/delete tool calls against a real customer workspace during smoke tests.
- Do not record secrets in this repository or conversation.
- If the deployed artifact, endpoint identity, or rollback target cannot be verified, stop before replacing the live MCP Worker.

## Testing exception

PR #14 adds Auth and MCP rate-limit client tests. Both GitHub Actions workflows passed for code/test commit `23f6bb96483d40dcc3e332c4b8889dd884f20dda`: each completed dependency installation, `npm run build:check`, and `npm test`. These tests mock the Durable Object namespace and do not prove SQLite transaction atomicity or concurrent consumption. Direct Durable Object tests and read-only production configuration checks remain release gates. Never run write-operation tests against a real customer workspace.

## Remaining guard implementation

- [x] Keep a SQLite-backed Durable Object for authorization IP and credential-attempt abuse protection.
- [x] Keep the same HMAC secret for privacy-preserving credential identity across the Auth and MCP Workers.
- [x] Use the Durable Object for provider-directed 429 cooldown state only; do not count ordinary MCP requests.
- [x] Remove per-credential and per-grant MCP usage counters and their configuration.
- [x] Remove the local fallback cooldown; only honor a valid provider Retry-After value.
- [ ] Re-run both package build checks and test suites after this change.
- [ ] Verify generated Durable Object migration metadata and production bindings/secrets before rollout.

The remaining local controls are not workspace quota enforcement. No local quota thresholds or cross-key workspace identity are required.

## Provider quota confirmation

SyrianFatora owns the workspace quota and its enforcement. The integration must rely on the provider's own response status and headers, including HTTP 429 and Retry-After. Any published default daily quota or paid-plan allowance is informational only; it must not be copied into a competing local cap.

The MCP Worker returns the provider's X-RateLimit-Limit and X-RateLimit-Remaining values when available. A local cooldown is stored only after an upstream 429 with a valid Retry-After value, and its duration is taken directly from that header. If the header is missing or invalid, no local cooldown is invented.

The HMAC API-key fingerprint is used only for privacy-preserving authorization-attempt protection and provider-directed cooldown state. It is not a workspace identifier and is not used to count normal MCP requests.

Provider source: https://syrianfatora.com/developers
