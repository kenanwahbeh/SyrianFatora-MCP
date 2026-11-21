# Production migration runbook and execution log

**Last updated:** 2026-11-21
**Source of truth:** This file is the only canonical location for live version IDs, deployment IDs, build IDs, traffic assignments, rollback references and production probe evidence.

## Current MCP production deployment

| Item | Verified value |
| --- | --- |
| Worker | `syrianfatora-mcp` |
| Endpoint | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| Version | v16 |
| Version ID | `bfe9cbad-f08c-4f67-9fc9-23136fe9f2ae` |
| Deployment ID | `9a33a35e-d8ab-473b-8e33-51a13b346a8c` |
| Traffic | 100% to v16 |
| Source commit | `7cfa1e84d7e825aa08bf4b8f5b10c5b18b7c106a` |
| Cloudflare Build ID | `72694a25-7494-4775-8f2c-9a2b069f78e5` |
| Build result | Success |
| Previous version | v15 — `5469a3d0-9b01-4803-ad00-4c6813df3e2c` |
| Previous deployment | `6d82978e-52cd-4442-a05c-cc9d8b595668` |

The successful Build ran the dependency audit, Cloudflare build check and 53 MCP tests. Cloudflare logs confirmed upload, 6 ms startup time, `AUTH_SERVER` → `syrianfatora-auth#SyrianFatoraAuth`, and `RATE_LIMITER` → `CredentialRateLimiter` in `syrianfatora-auth`. `IS_PREVIEW=false`.

**Important:** deployment is verified, but an authenticated post-v16 MCP functional smoke has not yet been recorded. Do not describe v16 as end-to-end smoke-tested or fully release-ready.

## Auth production baseline

| Item | Last recorded value |
| --- | --- |
| Worker | `syrianfatora-auth` |
| Issuer | `https://syrianfatora-auth.kinan-api.workers.dev` |
| Last documented version | v8 — `25c25a69-9fb2-4c75-b07b-a1cf00a49532` |
| Last documented deployment | `4bd65dcd-240e-44f7-b2db-c025a0b51a05` |
| OAuth KV | `syrianfatora-oauth-production` — `d19d9bd755c349f688cd55e299b8168f` |
| Durable Object namespace | `1303fb3e6d25453080035c0356b4d4bd` |

These are the last recorded Auth values. The MCP v16 Build did not build or deploy Auth. Re-read Cloudflare before any Auth release or rollback.

## MCP Build trigger

- Trigger ID: `593221cf-b17a-4506-979a-ebb7f4307c69`
- Worker script tag: `80f433e8c9db45adba9d8df05ff403d8`
- Branch: `main`; root: `/apps/mcp`
- Build: `npm audit --audit-level=high && npm run build:check && node --test`
- Path filters: `apps/mcp/**`, `apps/mcp/package.json`, `apps/mcp/package-lock.json`
- Permanent deploy command: `npx cf workers versions create --prebuilt --mode production`

The permanent command was restored and read back after deployment. It uploads an immutable version without changing production traffic. Promotion is a separate release action.

## One-time migration exception — 2026-11-21

Cloudflare rejected version upload because the existing Worker had Script API deployment history. The operator explicitly approved immediate production deployment for the initial real production cutover. The existing trigger was temporarily changed to `npx cf deploy --prebuilt --mode production --force`; Build `72694a25-7494-4775-8f2c-9a2b069f78e5` succeeded and deployed v16. The trigger was immediately restored to the permanent version-upload-only command and the restored value was verified.

This was a one-time approved migration exception. Never put `--force` in the permanent trigger or use it as a routine deployment path.

## Post-deployment smoke checklist

1. MCP `/health` returns HTTP 200 and `toolCount: 51`.
2. Protected-resource metadata returns HTTP 200 and advertises the Auth issuer.
3. A deliberately invalid Bearer token is rejected with HTTP 401.
4. Auth OAuth discovery returns the expected issuer and endpoints.
5. With an explicitly approved test credential, complete Authorization Code + PKCE.
6. Authenticated MCP `initialize`, `notifications/initialized` and `tools/list` succeed.
7. If separately authorized, run `customers_list` with `per_page=1`; do not print customer data.

Record timestamp, exact version, status codes and sanitized results after testing. Never include credentials, tokens or customer records.

A payment-void contract probe, only if separately authorized, must use a clearly nonexistent payment ID and `void_reason`. Expected behavior is that the request passes MCP schema validation and reaches REST, which returns not-found. Never void a real payment.

## Rollback

The immediately previous MCP version recorded before v16 is v15 (`5469a3d0-9b01-4803-ad00-4c6813df3e2c`), deployment `6d82978e-52cd-4442-a05c-cc9d8b595668`. Before rollback, inspect the current Cloudflare deployment list and confirm v15 remains available with expected bindings/configuration. Do not act on this historical note alone; explicit operator approval is required.

The last documented Auth rollback target was v7 (`5f9fe79d-1799-4a66-8f25-868f149dcd7a`), deployment `d07905f9-b987-4946-88cf-8accd662c1d3`. Verify availability and bindings before any action.

A source archive alone is not a complete rollback artifact. Verify Worker settings, bindings, secrets, KV/DO namespaces and deployment traffic independently.

## Implementation and security invariants

- Preserve the exact MCP Worker identity `syrianfatora-mcp`.
- Auth is a separate supporting Worker, not another public MCP endpoint.
- MCP validates tokens through the `AUTH_SERVER` Service Binding.
- Store the upstream API key only in provider-encrypted OAuth grant properties.
- `mcp:read` is required; writes additionally require `mcp:write`.
- A random grant subject or credential fingerprint is not a stable Workspace ID.
- Do not introduce local MCP request quotas; SyrianFatora owns Workspace quota.
- Record provider-directed cooldown only for a valid upstream `Retry-After`; do not invent a fallback or automatically retry.
- Never expose API keys, OAuth tokens, Cloudflare tokens, signing secrets or customer data.
- Do not change DNS, custom domains, production secrets or bindings without explicit approval.

## Historical notes

- The existing production MCP Worker was migrated in place; Auth was introduced as a separate OAuth authorization service.
- PR #57 aligned REST contracts and corrected payment voiding to `void_reason`; the associated Build passed 53 MCP tests.
- PR #58 added the `deploy:version` package script and version-only upload documentation.
- v15 predates the payment-void correction. v16 contains the corrected source.
- Historical live tests against pre-v16 are in `../skills/LIVE-TEST-RESULTS.md`; they are not evidence of post-v16 smoke testing.