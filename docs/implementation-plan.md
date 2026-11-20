# Implementation status and pre-Workspace release gates

**Last updated:** 2026-11-20

**Release status:** **NO-GO** for entering a real SyrianFatora Workspace API key.
**Source of truth for deployed IDs and production probes:** [production migration runbook](production-migration.md).

## Deployed production baseline

| Component | Current production state |
| --- | --- |
| Auth Worker | `syrianfatora-auth`, version #6 `2f25855b-9299-47a1-88f6-65bf04f48da9`, deployment `34b83009-a63b-418b-ace6-a9365ad70cf3` |
| MCP Worker | `syrianfatora-mcp`, version #8 `c83dc9c3-daf6-4f2e-961e-a792605c2ed7`, deployment `17e5289a-f676-49a6-b412-638f09b8776e` |
| MCP endpoint | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| OAuth issuer | `https://syrianfatora-auth.kinan-api.workers.dev` |
| MCP catalogue | 51 tools |
| Main-branch tests | Auth 41/41; MCP 21/21 |
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
- [ ] Merge the deployment-policy/runbook clarification in draft PR #50 after review.
- [ ] Keep any future one-time `--force` migration separate, explicitly approved, baseline-captured, and removed from the trigger afterward.

**Evidence:** PR #50 — https://github.com/kenanwahbeh/SyrianFatora-MCP/pull/50 (draft; not merged).

### 2. Authenticated Smoke Test — exercise real MCP tools

- [x] The operator-run script performs OAuth Authorization Code + PKCE, captures the loopback callback, and requests only `mcp:read`.
- [x] The script calls authenticated MCP `initialize`, `notifications/initialized`, `tools/list`, and read-only `customers_list` with `per_page=1`.
- [x] A local mocked integration test exercises registration, state, PKCE, session handling, tool discovery, and the read-only tool call without a real key or production request.
- [ ] Merge the smoke cache fix and local integration harness in draft PR #51 after review.
- [ ] Do not run the real production OAuth smoke yet; that belongs to gate 6 after gates 1–5 are closed.

**Evidence:** PR #51 — https://github.com/kenanwahbeh/SyrianFatora-MCP/pull/51 (draft; not merged). The local mock test is not production OAuth evidence.

### 3. Remove Preview artifacts from the Production interface

- [x] Confirmed production `/oauth/client-metadata.json` currently returns `SyrianFatora Preview E2E Client` and a placeholder `example.com` redirect URI.
- [x] Prepared a source fix that returns 404 in Production, retains the CIMD test document only in Preview, and removes the Preview suffix from the production MCP server version.
- [ ] Review and merge draft PR #52.
- [ ] Deploy only after separate explicit approval, then verify the production endpoint returns 404 and MCP `initialize` reports the non-Preview version.
- [ ] Preserve the isolated Preview Worker and its Preview-only CIMD test path; do not delete Preview resources as part of this cleanup.

**Evidence:** PR #52 — https://github.com/kenanwahbeh/SyrianFatora-MCP/pull/52 (draft; not merged or deployed).

### 4. Unify documentation and release history

- [ ] Review and merge this documentation update after confirming current Cloudflare versions, deployments, build IDs, test counts, rollback targets, and outstanding Preview cleanup status.
- [ ] Keep `docs/production-migration.md` as the canonical source for deployed version IDs, deployment IDs, probes, and rollback references.
- [ ] Keep the root and package READMEs as concise summaries that link to the canonical runbook.

### 5. Review credential separation and revocation

- [ ] Verify the Workspace key is held only in provider-encrypted grant properties and never appears in client-visible data, logs, URLs, or persistent plaintext records.
- [ ] Review grant revocation and token invalidation behavior, including the public revocation endpoint.
- [ ] Document the current limitations: credential replacement and user-facing disconnect/revocation UX are not implemented.
- [ ] Confirm the exact safe procedure for revoking a grant and replacing an upstream key before a real Workspace test.

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
