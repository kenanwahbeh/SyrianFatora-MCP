# Implementation status and pre-Workspace release gates

**Last updated:** 2026-11-20

**Release status:** **NO-GO** for further real-key testing until gates 1–5 are formally closed and reviewed. The Auth v8 lifecycle correction is deployed; gate 5 remains open only for client-side disconnect verification and user-facing credential replacement.
**Source of truth for deployed IDs and production probes:** [production migration runbook](production-migration.md).

## Deployed production baseline

| Component | Current production state |
| --- | --- |
| Auth Worker | `syrianfatora-auth`, version #8 `25c25a69-9fb2-4c75-b07b-a1cf00a49532`, deployment `4bd65dcd-240e-44f7-b2db-c025a0b51a05` (100% traffic) |
| MCP Worker | `syrianfatora-mcp`, version #11 `a1dcd66c-1a5c-48d1-bc1d-f63b1962d950`, deployment `01fa136b-96b9-436d-be33-165390c6a099` (100% traffic; `IS_PREVIEW=false`) |
| MCP endpoint | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| OAuth issuer | `https://syrianfatora-auth.kinan-api.workers.dev` |
| MCP catalogue | 51 tools |
| Main-branch tests | Auth 43; MCP 24 |
| Dependency audit | 0 high-severity vulnerabilities |

Production health, OAuth discovery, protected-resource metadata, MCP tool count, and invalid-token rejection have passed. In addition, the operator confirmed that a production read-only OAuth Authorization Code + PKCE smoke completed successfully with two real Workspace keys (`KEY_1` and `KEY_2`), including authenticated MCP initialization, tool discovery, and `customers_list`.

## Completed implementation

- [x] Preserve the existing `syrianfatora-mcp` Worker and migrate it in place.
- [x] Deploy the separate `syrianfatora-auth` OAuth authorization Worker.
- [x] Connect MCP to Auth through the `AUTH_SERVER` Service Binding.
- [x] Implement Authorization Code + PKCE, Dynamic Client Registration, Client ID Metadata Document support, and `mcp:read` / `mcp:write` scope enforcement.
- [x] Keep the Workspace API key in provider-encrypted grant properties; do not expose it to the MCP client.
- [x] Preserve all 51 MCP tools and their upstream semantics.
- [x] Keep authorization-attempt abuse protection and provider-directed 429 cooldown only; do not meter ordinary MCP requests locally.
- [x] Verify the SQLite Durable Object concurrency behavior and provider-directed cooldown tests.
- [x] Deploy the OAuth consent retry fix to Auth v6; PR #49 is merged to `main`.
- [x] Verify the live Auth and MCP production health/discovery probes and the production build pipeline.
- [x] Merge the scope-aware refresh-token consent correction in PR #54 and deploy it to Auth Worker v8; Auth tests cover optional `offline_access`, rotation, grant isolation, and revocation.

## Ordered pre-Workspace gates

Complete these gates in this exact order. The historical two-key smoke is documented below; do not perform additional real-key tests out of sequence.

### 1. Deployment gate — remove automatic `--force`

- [x] Read-only inspection confirms both current production Cloudflare Build deploy commands are `npx cf deploy --prebuilt --mode production` with no `--force`.
- [x] Both triggers are path-scoped to their own application directories and target `main`.
- [x] Merge the deployment-policy/runbook clarification in PR #50; both live triggers remain free of `--force`.
- [x] Policy prohibits `--force` in automatic triggers; any exceptional one-time migration requires separate explicit approval, a captured baseline, a verified artifact, and a rollback plan.

**Evidence:** PR #50 merged to `main`; live Cloudflare Build triggers were rechecked after merge.

### 2. Smoke Test implementation — prepare authenticated MCP tool coverage

- [x] Implemented the operator-run script for OAuth Authorization Code + PKCE, loopback callback capture, and `mcp:read` only.
- [x] Implemented authenticated MCP calls in the script: `initialize`, `notifications/initialized`, `tools/list`, and read-only `customers_list` with `per_page=1`.
- [x] A local mocked integration test exercises registration, state, PKCE, session handling, tool discovery, and the read-only tool call without a real key or production request.
- [x] Confirmed that the script and mock test are implementation evidence only; separately, a real production OAuth smoke was later run successfully with two real Workspace keys (`KEY_1` and `KEY_2`).
- [x] Merge the smoke cache fix and local integration harness in PR #51; the MCP suite on `main` now includes the local mock OAuth/MCP flow test.
**Historical execution note:** The real production OAuth smoke was subsequently run successfully with `KEY_1` and `KEY_2` before gates 1–5 were all formally closed. Record this as completed read-only test evidence, not as permission to continue testing out of sequence. Any further real-key testing remains blocked until gates 1–5 are closed and reviewed.

**Evidence:** PR #51 merged to `main`; MCP tests pass 24/24. The local mock test is not production OAuth evidence.

### 3. Remove Preview artifacts from the Production interface

- [x] Recorded the pre-cleanup production response: `/oauth/client-metadata.json` exposed `SyrianFatora Preview E2E Client` and a placeholder `example.com` redirect URI.
- [x] Implemented the production 404 gate, retained the CIMD test document only in Preview, and removed the Preview suffix from the production MCP server version.
- [x] Merge PR #52 and verify the automatic Cloudflare Build deployment.
- [x] Verify production `/oauth/client-metadata.json` returns 404 and the live Worker binding has `IS_PREVIEW=false`.
- [x] Preserve the isolated Preview Worker and its Preview-only CIMD test path; no Preview resources were deleted.

**Evidence:** PR #52 merged; Cloudflare Build `249f8daf-d0c8-41dc-8f9c-91a7d9cb7ff5`, MCP v10 deployment `1c27f7ac-ee02-47a8-9b5e-b28044f7e526`. Immediate rollback v9 reintroduces the Preview metadata route.

### 4. Unify documentation and release history

- [ ] Review and merge this documentation update after confirming current Cloudflare versions, deployments, build IDs, test counts, rollback targets, and outstanding Preview cleanup status.
- [ ] Keep `docs/production-migration.md` as the canonical source for deployed version IDs, deployment IDs, probes, and rollback references.
- [ ] Keep the root and package READMEs as concise summaries that link to the canonical runbook.

### 5. Review credential separation and revocation

- [x] Confirmed the Workspace key is stored in provider-encrypted grant `props` and returned only to the internal MCP resource Worker after token validation; raw keys are not used as limiter identifiers.
- [x] Confirmed revocation semantics: access-token revocation removes that token only; refresh-token revocation removes the full grant and encrypted props.
- [x] Confirmed each authorization is an independent grant. Reauthorizing the same OAuth client does not replace an earlier key because no stable Workspace identifier is available.
- [x] Identified and corrected the mismatch between optional `offline_access` consent and refresh-token issuance.
- [x] Merge PR #54 (`75c8f0616f8eea1526d4bfda559a8fc9ce456525`); Auth Worker v8 is deployed with 100% traffic.
- [x] Add isolated regression coverage for no-refresh when `offline_access` is absent, refresh-token rotation, grant isolation, access-token revocation, and full grant revocation.
- [ ] Decide and implement the supported user-facing disconnect/replacement procedure. Whether ChatGPT sends RFC 7009 revocation on disconnect remains unverified.

**Evidence:** [PR #54](https://github.com/kenanwahbeh/SyrianFatora-MCP/pull/54) is merged. Cloudflare Auth v8 `25c25a69-9fb2-4c75-b07b-a1cf00a49532`, deployment `4bd65dcd-240e-44f7-b2db-c025a0b51a05` (100% traffic). The deployment was created automatically after the merge; this documentation task did not deploy or modify Workers.

### 6. Real OAuth test — read-only only

**Historical evidence:** The operator confirmed that the production OAuth Authorization Code + PKCE flow was successfully completed with two real Workspace keys (`KEY_1` and `KEY_2`). Each authorization used `mcp:read` only and completed authenticated MCP `initialize`, `notifications/initialized`, `tools/list`, and `customers_list` with `per_page=1`. No write operation was run and no key value or customer record is retained in this repository.

This test occurred before gates 1–5 were all formally closed. It is recorded accurately as historical evidence, but does not waive the agreed order or authorize additional real-key tests. Further testing may start only after gates 1–5 are closed and reviewed.

- [x] For the completed smoke, the user entered each real Workspace API key only on the first-party HTTPS Auth authorization page; no key value was copied into chat, a shell command, GitHub, or logs.
- [x] Approved only `mcp:read` for both key sessions.
- [x] Completed OAuth Authorization Code + PKCE and verified access-token issuance for both sessions. **Refresh-token lifecycle was not established by this smoke.**
- [x] Executed authenticated `initialize`, `notifications/initialized`, `tools/list`, and `customers_list` with `per_page=1` for both sessions.
- [x] The smoke test did not print or persist API keys, access tokens, or returned customer records.
- [ ] Do not run create, update, or delete operations against a real Workspace.

## Global stop conditions

- No additional real Workspace-key test before gates 1–5 are formally closed, notwithstanding the historical two-key smoke recorded above.
- No production write operations.
- No merge or production deployment without separate explicit approval.
- No deletion of Preview Workers, Preview environments, or related resources as part of interface cleanup.
- Never persist `--force` in automatic CI or Cloudflare Build production triggers.
- If live version, bindings, secrets, endpoint identity, or rollback reference cannot be verified, stop.
- Never record API keys, access tokens, refresh tokens, signing keys, or Cloudflare credentials in this repository or conversation.
