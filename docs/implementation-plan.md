# Implementation status and pre-Workspace release gates

**Last updated:** 2026-11-20

**Release status:** **NO-GO** for entering a real SyrianFatora Workspace API key.
**Source of truth for deployed IDs and production probes:** [production migration runbook](production-migration.md).

## Deployed production baseline

| Component | Current production state |
| --- | --- |
| Auth Worker | `syrianfatora-auth`, version #6 `2f25855b-9299-47a1-88f6-65bf04f48da9`, deployment `34b83009-a63b-418b-ace6-a9365ad70cf3` |
| MCP Worker | `syrianfatora-mcp`, version #10 `8b7e8158-b175-44fe-98d5-4f151eef51f2`, deployment `1c27f7ac-ee02-47a8-9b5e-b28044f7e526` |
| MCP endpoint | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| OAuth issuer | `https://syrianfatora-auth.kinan-api.workers.dev` |
| MCP catalogue | 51 tools |
| Main-branch tests | Auth 41/41; MCP 24/24 |
| Dependency audit | 0 high-severity vulnerabilities |

Production health, OAuth discovery, protected-resource metadata, MCP tool count, and invalid-token rejection have passed. These checks do **not** prove a successful OAuth authorization using a real Workspace key or an authenticated MCP tool call.

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

## Ordered pre-Workspace gates

Complete these gates in this exact order. Do not skip ahead to a real key.

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
- [x] Confirmed that the script and mock test are implementation evidence only; no real production Workspace OAuth smoke has been run.
- [x] Merge the smoke cache fix and local integration harness in PR #51; the MCP suite on `main` now includes the local mock OAuth/MCP flow test.
**Deferred to gate 6:** The real production OAuth smoke has not been run. It may start only after gates 1–5 are closed and reviewed.

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
- [x] Identified a consent mismatch: the deployed Auth v6 can issue a refresh token even when `offline_access` was not approved. A correction and regression tests are prepared in draft PR #54.
- [ ] Merge PR #54 after CI/review; do not deploy it without separate approval.
- [ ] Decide and document the supported disconnect/replacement procedure. User-facing disconnect UI is absent, and whether ChatGPT sends RFC 7009 revocation on disconnect is unverified.

**Evidence:** PR #54 — https://github.com/kenanwahbeh/SyrianFatora-MCP/pull/54 (draft; not merged or deployed). Detailed source review is included in that PR.

### 6. Real OAuth test — read-only only

This gate may start only after gates 1–5 are closed and reviewed.

- [ ] The user enters the real Workspace API key only on the first-party HTTPS Auth authorization page; never paste it into chat, a shell command, GitHub, or logs.
- [ ] Approve only `mcp:read`.
- [ ] Complete OAuth Authorization Code + PKCE and verify token issuance/refresh as required by the client.
- [ ] Execute only `initialize`, `tools/list`, and `customers_list` with `per_page=1`.
- [ ] Verify no customer records, API keys, or tokens are printed or persisted by the smoke test.
- [ ] Do not run create, update, or delete operations against a real Workspace.

## Global stop conditions

- No real Workspace key before gate 6.
- No production write operations.
- No merge or production deployment without separate explicit approval.
- No deletion of Preview Workers, Preview environments, or related resources as part of interface cleanup.
- Never persist `--force` in automatic CI or Cloudflare Build production triggers.
- If live version, bindings, secrets, endpoint identity, or rollback reference cannot be verified, stop.
- Never record API keys, access tokens, refresh tokens, signing keys, or Cloudflare credentials in this repository or conversation.
