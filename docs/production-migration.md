# Production migration runbook and execution log

**Last updated:** 2026-11-20

**Status:** Production OAuth infrastructure deployed. An operator-confirmed read-only OAuth smoke succeeded with two real Workspace keys (`KEY_1` and `KEY_2`). Auth v8 now includes the merged scope-aware refresh-token correction. Further real-key testing remains NO-GO pending the ordered gates in `docs/implementation-plan.md`; client-side disconnect verification and user-facing credential replacement remain outstanding.

## Current production state — 2026-11-20

| Item | Verified production value |
| --- | --- |
| Cloudflare account subdomain | `kinan-api` |
| Auth Worker | `syrianfatora-auth` |
| Auth issuer | `https://syrianfatora-auth.kinan-api.workers.dev` |
| Auth version / deployment | v8 `25c25a69-9fb2-4c75-b07b-a1cf00a49532` / `4bd65dcd-240e-44f7-b2db-c025a0b51a05` (100% traffic) |
| Auth immediate rollback | v7 `5f9fe79d-1799-4a66-8f25-868f149dcd7a` / `d07905f9-b987-4946-88cf-8accd662c1d3` |
| Existing MCP Worker | `syrianfatora-mcp` (migrated in place) |
| MCP resource URL | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| MCP version / deployment | v11 `a1dcd66c-1a5c-48d1-bc1d-f63b1962d950` / `01fa136b-96b9-436d-be33-165390c6a099` (100% traffic; `IS_PREVIEW=false`) |
| MCP immediate rollback | v10 `8b7e8158-b175-44fe-98d5-4f151eef51f2` / `1c27f7ac-ee02-47a8-9b5e-b28044f7e526` (100% traffic before v11; retains the Preview cleanup) |
| MCP pre-migration baseline | v4 `ab4d6f5c-a8d9-4150-a6a0-120499a2b9c5` (captured before code migration; secret already present) |
| OAuth KV | `syrianfatora-oauth-production`, `d19d9bd755c349f688cd55e299b8168f` |
| SQLite Durable Object | `CredentialRateLimiter`, namespace `1303fb3e6d25453080035c0356b4d4bd` |
| Shared HMAC secret | `RATE_LIMIT_HMAC_SECRET` exists on both Workers; same random 48-byte value, never logged |
| Auth attempt limits | 7 attempts/IP/60s; 2 attempts/credential/60s |
| workers.dev | Enabled for both production Workers |
| Public version-preview URLs | Disabled for both production Workers |
| MCP tools | 51 preserved; production health reports `toolCount: 51` |

The MCP Worker has `AUTH_SERVER` bound to `syrianfatora-auth#SyrianFatoraAuth` and `RATE_LIMITER` bound to the Auth Worker's SQLite Durable Object namespace. The Auth Worker has the production KV binding and the same HMAC secret. No custom domain or DNS record was changed.

**Rollback note:** The immediate rollback targets are Auth v7 (`5f9fe79d-1799-4a66-8f25-868f149dcd7a`) and MCP v10 (`8b7e8158-b175-44fe-98d5-4f151eef51f2`). MCP v10 retains the Preview cleanup. MCP v9 (`ef5d0c42-9375-42b2-81e4-73b734707b22`) predates that cleanup and re-exposes the Preview metadata endpoint; do not roll back to v9 without reapplying the Preview gate. MCP v4 (`ab4d6f5c-a8d9-4150-a6a0-120499a2b9c5`) remains the captured pre-migration baseline.

### Verification

- Auth `/health`: HTTP 200.
- Auth `/.well-known/oauth-authorization-server`: HTTP 200; issuer and endpoints match production URLs.
- MCP `/health`: HTTP 200; reports 51 tools.
- MCP protected-resource metadata: HTTP 200 at `/.well-known/oauth-protected-resource/mcp`; advertises the Auth issuer.
- MCP request with a deliberately invalid bearer token: HTTP 401.
- GitHub Actions production smoke runs `44456841885` (initial cutover) and `44457599094` (after final MCP version 6 and preview-URL disablement) both completed successfully on 2026-11-19.
- Auth unit tests: 43 pass on the merged Auth v8 source, including optional refresh-token consent, refresh-token rotation, grant isolation, revocation, SQLite Durable Object concurrency serialization, and provider-directed 429 cooldown.
- MCP unit tests on `main`: 24 pass.
- `npm audit --audit-level=high`: zero vulnerabilities for both packages using npm 10.9.2, matching Cloudflare Build.
- **Completed separately:** an operator-confirmed production Authorization Code + PKCE smoke using two real Workspace keys (`KEY_1` and `KEY_2`), with `mcp:read` only and authenticated MCP calls. See the dedicated evidence section below.
- **Still outstanding:** client/ChatGPT-side disconnect and revocation behavior, and user-facing disconnect/replacement UX. Provider-level refresh-token issuance, rotation, and revocation are implemented and covered by Auth tests. No production write operations were tested.



## Agreed outcome

Migrate the existing Cloudflare MCP resource Worker in place. Keep the exact production service name `syrianfatora-mcp`, preserve its public MCP endpoint identity and its 51 tools. Add a separate OAuth authorization Worker named `syrianfatora-auth`, connected by Service Binding `AUTH_SERVER` → `SyrianFatoraAuth`. Do not create a replacement MCP Worker.

CI now runs Auth and MCP unit tests, a high-severity npm audit gate, and Cloudflare build checks. The Auth suite includes SQLite Durable Object concurrency tests. Production verification is restricted to read-only smoke tests; no write operation was sent to a real workspace.

## Pre-migration production baseline — read-only inspection (2026-11-18)

Cloudflare account: the account currently connected for this project.

| Property | Observed value |
| --- | --- |
| Existing Worker | `syrianfatora-mcp` |
| Current version number | `3` |
| Current version ID | `736b294b-8a02-4591-8b30-04e988eee348` |
| Current deployment ID | `33d6c932-4ceb-42a1-8934-d979c5557640` |
| Deployment timestamp | `2026-11-17T09:25:37.714818Z` |
| Deployment source | Cloudflare API upload |
| Compatibility date | `2026-11-16` |
| Compatibility flags | none |
| Worker Service Binding list | empty |
| Workers.dev account subdomain | `kinan-api` |
| MCP Worker workers.dev enabled | yes |
| Worker preview URLs enabled | no |
| Worker custom domains | none found |
| Account KV namespaces before this session | none found |
| Auth Worker in account | none found at inspection |
| Observed existing custom Worker domains | `bytebalancetech.com`, `admin.bytebalancetech.com`, both attached to `bytebalancetech`; neither is an MCP domain |

The candidate workers.dev origin derived from the enabled account subdomain and Worker name is:

`https://syrianfatora-mcp.kinan-api.workers.dev`

Candidate MCP URL:

`https://syrianfatora-mcp.kinan-api.workers.dev/mcp`

**Historical note:** this was a candidate URL before deployment. The 2026-11-19 GitHub Actions smoke workflow has since verified the production HTTPS endpoint and its health response.

## Pre-migration rollback source verification — 2026-11-18

Before the in-place cutover, the live legacy MCP Worker script was retrieved read-only from Cloudflare. Its extracted JavaScript content matched byte-for-byte with the repository archive:

- Repository archive: `src/worker-v1.1.0.mjs`
- Archive blob SHA: `a93e1c254efb2a840c951f1a7326e28432e8f561`
- Extracted live script length: 9,960 characters
- Archived script length: 9,960 characters
- Exact content comparison: **MATCH**

This verified the pre-migration source archive against the legacy live script. It did not by itself preserve all Worker metadata or deployment configuration; the settings, bindings, version details, and deployment metadata were also captured before the production overwrite.

## Previous failed deployment — 2026-11-18

The Cloudflare Build completed checkout, dependency installation, and `npm run build:check`, then aborted during deploy.

The reported conflict was:

- Configured Worker name: `syrianfatora-mcp-oauth-preview`
- Cloudflare CI target Worker: `syrianfatora-mcp`
- The live Worker was last updated through the script API.
- Cloudflare warned that a CLI upload would override script-API edits and aborted, suggesting `cf deploy --force`.

No successful production overwrite was reported from this failed build. The later in-place migration was separately reviewed after the live MCP script/version and rollback reference were captured. Any `--force` use was a one-time migration exception, not a standing deployment setting. A read-only inspection on 2026-11-20 confirmed that both current production Cloudflare Build triggers deploy with `npx cf deploy --prebuilt --mode production` and contain no `--force`.

## Provider quota and abuse-protection behavior

The source change removes the competing local usage quotas:
1. Auth approval retains IP-attempt and repeated credential-validation-attempt protections before upstream key validation.
2. MCP no longer increments a per-credential or per-grant request counter and has no local daily/monthly quota.
3. The SQLite Durable Object remains for authorization abuse protection and provider-directed cooldown state only.
4. After SyrianFatora returns HTTP 429, a cooldown is stored only if the response contains a valid Retry-After value. The provider's duration is used as-is; no fallback is invented.
5. No automatic retry is performed. The provider's 429 and quota headers remain authoritative.

No workspace quota thresholds need to be selected or configured locally. The HMAC secret remains relevant to the remaining credential-attempt protection and credential-scoped provider cooldown identity. Before production cutover, Worker bindings, secret presence, generated Durable Object metadata, endpoint identity, and rollback references were independently checked; the current deployed versions and their verification results are recorded above.

## Production configuration — completed

- Auth Worker name: `syrianfatora-auth`.
- Auth `ISSUER`: `https://syrianfatora-auth.kinan-api.workers.dev`.
- Auth and MCP `MCP_SERVER_URL`: `https://syrianfatora-mcp.kinan-api.workers.dev/mcp`.
- MCP `AUTH_SERVER_URL`: `https://syrianfatora-auth.kinan-api.workers.dev`.
- Auth `OAUTH_KV`: production namespace `d19d9bd755c349f688cd55e299b8168f`.
- Auth exports SQLite Durable Object `CredentialRateLimiter`, namespace `1303fb3e6d25453080035c0356b4d4bd`.
- MCP `AUTH_SERVER`: Service Binding to `syrianfatora-auth`, entrypoint `SyrianFatoraAuth`.
- MCP `RATE_LIMITER`: Durable Object binding to `CredentialRateLimiter` in `syrianfatora-auth`.
- Both Workers have the same random 48-byte `RATE_LIMIT_HMAC_SECRET`; the value is not readable through Cloudflare's secret API and is not recorded here.
- Auth abuse protection is enabled in production: 7/IP/60s and 2/credential/60s.
- Both primary workers.dev routes are enabled; public version-preview URLs are disabled.
- No custom domain, DNS, unrelated Worker, or admin site was changed.

## Cloudflare Build triggers

**Auth Worker**
- Script tag: `306b76a577eb4cfeb9b8dfb1f0c12484`
- Trigger ID: `76787337-ed7e-49da-897a-39f548a65b91`
- Repository/branch: `kenanwahbeh/SyrianFatora-MCP`, `main`
- Root: `/apps/auth`
- Build: `npm audit --audit-level=high && npm run build:check && node --test`
- Deploy: `npx cf deploy --prebuilt --mode production`
- Paths: `apps/auth/**`, `apps/auth/package.json`, `apps/auth/package-lock.json`

**Existing MCP Worker**
- Script tag: `80f433e8c9db45adba9d8df05ff403d8`
- Trigger ID: `593221cf-b17a-4506-979a-ebb7f4307c69`
- Repository/branch: `kenanwahbeh/SyrianFatora-MCP`, `main`
- Root: `/apps/mcp`
- Build: `npm audit --audit-level=high && npm run build:check && node --test`
- Deploy: `npx cf deploy --prebuilt --mode production` (verified 2026-11-20; no `--force`)
- Paths: `apps/mcp/**`, `apps/mcp/package.json`, `apps/mcp/package-lock.json`

Both triggers target `main`, are path-scoped to their respective app directories/package manifests, and have automatic builds enabled. Documentation-only changes do not start production deployments. The deploy command on each trigger contains no `--force`; any future one-time migration exception must be explicitly approved and must not be persisted in the trigger.

## Execution log

| 2026-11-18 | PR #14 source audit | Confirmed Auth/MCP Durable Object binding topology, shared same-key HMAC identity, MCP upstream gate, and fail-closed behavior. Added focused client tests and updated architecture/security/implementation documentation. Production settings and SQLite atomicity/concurrency remain unverified. |

| Time (UTC) | Action | Result |
| --- | --- | --- |
| 2026-11-18 | Inspected production Worker settings, versions, deployments, domains, workers.dev subdomain, and KV namespaces | Read-only; completed |
| 2026-11-18 | Retrieved live `syrianfatora-mcp` script and compared with `src/worker-v1.1.0.mjs` | Exact source match |
| 2026-11-18 | Checked Cloudflare KV namespace list | Initially empty |
| 2026-11-18 | Created KV namespace `syrianfatora-oauth-production` | Created; ID `d19d9bd755c349f688cd55e299b8168f`; at that pre-deployment point it was not yet bound |
| 2026-11-18 | Inspected existing Cloudflare Build trigger | Root `/apps/mcp`; build `npm run build:check`; deploy `npx cf deploy --prebuilt --mode production`; branch `main`; only `apps/mcp/**` and its package manifests trigger it |
| 2026-11-18 | Attempted to merge documentation PR #13 | GitHub blocked merge while CodeQL results were pending; no bypass attempted |
| 2026-11-18 | Checked existing Worker domains | No MCP custom domain found |
| 2026-11-18 | Reviewed previous Cloudflare Build failure | Deployment aborted on Worker-name/script-API conflict |
| 2026-11-18 | Changed existing MCP Worker code, bindings, routes, DNS, or deployment | **No changes made** |

| 2026-11-19T04:02Z | Created production Auth Worker and configured shared HMAC secret | `syrianfatora-auth`; workers.dev enabled; production KV and SQLite DO created; same 48-byte secret set on Auth and MCP |
| 2026-11-19T04:06Z | Deployed Auth Worker | Version 3 `749ba335-b8ab-491c-8e7a-c4d703056ad6`; deployment `6f6c17ce-db28-4b4b-bf3f-a2e5195d1a62`; public preview URLs disabled |
| 2026-11-19T04:11Z | Migrated existing MCP Worker in place | `syrianfatora-mcp` version 5 `0b68ea33-028d-4d7e-995e-9faa64d6eb2e`; Service Binding and Durable Object bindings verified |
| 2026-11-19T04:16Z | Final MCP production deployment | Version 6 `392a040a-eff8-421d-952b-0075dc74e703`; deployment `6fe36215-6e5d-4368-8744-ea90473b78c3`; public preview URLs disabled |
| 2026-11-19 | Production smoke tests | Auth/MCP health, OAuth discovery, protected-resource metadata, 51-tool health count, and invalid-token HTTP 401 all passed |
| 2026-11-19 | Dependency audit and unit tests | npm 10.9.2 audit: zero vulnerabilities; Auth 40/40 tests; MCP 21/21 tests; SQLite concurrency test passed |
| 2026-11-19 | Real-key OAuth end-to-end (status at time of entry) | Not yet run at the time this historical log entry was written; later two-key read-only smoke evidence is recorded in the 2026-11-20 section below. No workspace writes were performed |

## Change record template

For every production action, append a row with:
- UTC timestamp
- resource name and type
- exact action
- previous value/version
- resulting value/version/deployment ID
- read-only verification result
- rollback action/reference
- any unresolved warning

Never record credential values or secret material in this file.

## Authorization abuse guard and provider cooldown implementation (2026-11-19)

- Retained IP and repeated credential-fingerprint attempt protection before upstream key validation.
- Removed the local per-credential MCP request budget and per-OAuth-grant sliding-window budget.
- MCP requests no longer charge local request counters.
- Kept a credential-scoped cooldown only after SyrianFatora returns HTTP 429 with a valid Retry-After header.
- Removed the configured fallback cooldown; missing or invalid Retry-After does not create a local wait period.
- Kept provider quota headers visible in MCP tool responses and disabled automatic retries.

The HMAC fingerprint is not a workspace identifier and is not used to meter API usage. No local daily/monthly/per-key/per-grant quota is enforced.

Historical note for the source-only quota update before production cutover: no production Worker, route, DNS record, secret, binding, or customer workspace was changed by that commit. The production deployment and verification are recorded in the current-state section above.

### Preview configuration correction (2026-11-18)

The first CI build rejected Wrangler's top-level previews property because this repository uses the typed cf/config API. Both Worker configs now use defineConfig(({ isPreview }) => ...) and omit the RATE_LIMITER binding for Preview builds. Preview requests therefore fail closed before any SyrianFatora upstream call. The Preview command for this toolchain is cf previews deploy; do not use npx wrangler preview against these cf/config projects.

## SyrianFatora quota handling

SyrianFatora is the source of truth for workspace usage and quota. The MCP integration does not replicate published daily/monthly values as a local cap. It forwards normal requests and returns provider quota headers when present.

A local cooldown is recorded only from a valid provider Retry-After value after an upstream HTTP 429. No fallback cooldown is configured. Distinct API keys and OAuth grants do not create separate local request budgets because no local request budget exists.

## Branch build validation change (2026-11-18)

The branch-specific Cloudflare Build trigger for this migration branch now runs from /apps/mcp with npx cf deploy --dry-run. This validates the MCP Worker configuration and Build Output without uploading a Worker version, creating a Preview, or changing production. The separate main-branch production trigger was not modified.

## Production/Preview Worker identity split (2026-11-18)

Typed cf/config now resolves Worker names and cross-Worker bindings by isPreview:
- Production config targets the existing syrianfatora-mcp Worker and the separate syrianfatora-auth Worker.
- Preview config uses syrianfatora-mcp-oauth-preview and syrianfatora-auth-preview.
- The production MCP Durable Object and authorization Service Bindings both target syrianfatora-auth.
- Preview omits RATE_LIMITER, so it cannot call the SyrianFatora upstream API.
- The production OAuth KV config points to the already-created syrianfatora-oauth-production namespace. Historical pre-deployment state. Superseded by the 2026-11-19 production deployment record above; production URLs and KV/DO bindings are now configured and smoke-tested.

No deployment was performed by this configuration change.

## Cloudflare dry-run verification (2026-11-18)

- Build ID: 21ac2039-97a6-4ac2-90e5-c97ca1455a4a
- Commit: 5ed44312e0720cae16c2247a39cd6e35c47d9fa4
- Command: npx cf deploy --dry-run
- Root: /apps/mcp
- Result: success; no Worker version upload or production deployment.
- Confirmed bindings in dry-run output:
  - RATE_LIMITER -> CredentialRateLimiter exported by syrianfatora-auth
  - AUTH_SERVER -> SyrianFatoraAuth exported by syrianfatora-auth
- Confirmed the configured Worker name matches the existing production MCP Worker name, syrianfatora-mcp. Production binding names are now aligned with the agreed in-place migration.

Historical 2026-11-18 finding: the dependency installation step reported 5 high-severity npm audit findings. Rechecked on 2026-11-19 with npm 10.9.2, matching Cloudflare Build, both package audits returned zero vulnerabilities. CI and Cloudflare Build triggers now enforce `npm audit --audit-level=high`.

The branch-only Cloudflare dry-run trigger now filters to apps/mcp/** so documentation-only changes do not start unnecessary builds. The main-branch production trigger remains unchanged.


## PR #14 verification update (2026-11-18)

- Branch: `security/rate-limit-audit-pr14`
- PR: https://github.com/kenanwahbeh/SyrianFatora-MCP/pull/14
- No Cloudflare production resources, DNS, Worker routes, or deployments were changed.
- Added `apps/auth/test/rate-limit-client.test.mjs` and `apps/mcp/test/rate-limit-client.test.mjs`.
- Both GitHub Actions workflows passed for code/test commit `23f6bb96483d40dcc3e332c4b8889dd884f20dda`: MCP run #59 and Auth run #74. Both completed dependency installation, `npm run build:check`, and `npm test`.
- Historical pre-deployment note. Superseded on 2026-11-19: the Auth suite now exercises the SQLite-backed Durable Object and passes the concurrent authorization-attempt serialization test.
- Historical pre-deployment note. Superseded on 2026-11-19: Cloudflare settings confirm the MCP Durable Object and Service Bindings point to the production Auth Worker, and the same 48-byte HMAC secret was set on both Workers in one operation.
- Preview deliberately omits `RATE_LIMITER`; rate-limited operations fail closed there.


## Quota policy correction — 2026-11-19

This section supersedes earlier PR #14 notes in this file that described local per-credential request budgets, per-grant request windows, a configured fallback cooldown, or a requirement to aggregate multiple API keys into a local workspace quota. Those descriptions document the previous implementation and are no longer current. The current source leaves workspace quota enforcement to SyrianFatora, retains authorization-attempt abuse protection, and stores a cooldown only from a valid provider Retry-After response. No local API usage quota is active.

## OAuth consent retry release — 2026-11-20

| Time (UTC) | Resource / action | Result and verification |
| --- | --- | --- |
| 2026-11-20T02:12:39Z | Auth Worker Cloudflare Build attempt for commit `136ec2a07e038354d6f32b491ee6460e97441d99` | Build validation failed before deployment: the refresh-token rotation test used the provider's 60-second minimum TTL and intermittently expired during rotation. No Worker version was uploaded; active version remained #4 `93411491-de13-4cd9-8d7e-d441d07ad674`. |
| 2026-11-20T02:21:47Z–02:23:41Z | Auth Worker production Build for commit `a638ffb11f9929a536892703af13c48cb0b96ce5` (branch `fix/issue-17-oauth-consent-retry`) | Build `9151b105-479a-43b2-afee-393b2d84247e` succeeded. Dependency audit: zero vulnerabilities. Auth test suite: 41/41 passed. Deployed `syrianfatora-auth` version #5 `53dfd48f-5b83-49f9-bd8a-229255d82790`; deployment `d66496cb-7e13-48a4-8c4d-433c8dfd560d`; 100% traffic. |
| 2026-11-20T02:23:42Z | Post-deployment read-only smoke checks | `/health` returned `ok: true`; OAuth discovery returned the expected issuer, authorization/token endpoints, and `mcp:read`, `mcp:write`, `offline_access` scopes. Cloudflare secret-binding inventory confirms `RATE_LIMIT_HMAC_SECRET` remains present; secret value was not read. |
| 2026-11-20 | Rollback reference | Previous Auth Worker version #4 `93411491-de13-4cd9-8d7e-d441d07ad674`, deployment `67a91b5b-9b1b-4ca0-8af6-b88a657dc543`. |

The release changed only the Auth Worker code. No MCP Worker, KV namespace, Durable Object, secret value, DNS record, custom domain, or customer workspace data was modified. The first failed build did not deploy. PR #49 was subsequently merged to `main` at commit `b81461cf619d17da77d384149711fd0fe78abb7f`. That merge triggered the then-current Auth v6 Cloudflare Build; it did not change the MCP Worker. This historical release was superseded by the PR #54 deployment recorded below.

## Current deployment verification — 2026-11-20

| Worker | Successful Cloudflare Build | Source commit | Deployed version | Deployment |
| --- | --- | --- | --- | --- |
| Auth | `0c5e5ce8-09ed-4351-bcaa-c27f9c4cf8aa` | `b81461cf619d17da77d384149711fd0fe78abb7f` (merge of PR #49) | #6 `2f25855b-9299-47a1-88f6-65bf04f48da9` | `34b83009-a63b-418b-ace6-a9365ad70cf3` |
| MCP (Preview cleanup) | `249f8daf-d0c8-41dc-8f9c-91a7d9cb7ff5` | `73d58ac9e438d933bd7a9f5bc54bf7acf902c474` (merge of PR #52) | #10 `8b7e8158-b175-44fe-98d5-4f151eef51f2` | `1c27f7ac-ee02-47a8-9b5e-b28044f7e526` |

Both builds completed successfully. The Auth and MCP build commands each ran dependency audit, `cf build`, and `node --test`; both production deploy commands omitted `--force`.

Read-only post-deployment probes on 2026-11-20 returned:
- Auth `/health`: `ok: true`.
- Auth OAuth discovery: expected issuer, authorization/token endpoints, protected resource, and scopes.
- MCP `/health`: `ok: true`, `toolCount: 51`.

These unauthenticated probes alone do not establish a Workspace-key OAuth session; the separate two-key authenticated smoke evidence is recorded below.

## Production Preview artifact cleanup — 2026-11-20

Before PR #52, a read-only GET to `https://syrianfatora-mcp.kinan-api.workers.dev/oauth/client-metadata.json` returned HTTP 200 with `SyrianFatora Preview E2E Client` and placeholder redirect URI `https://example.com/oauth/callback`.

PR #52 was merged in commit `73d58ac9e438d933bd7a9f5bc54bf7acf902c474`. Cloudflare Build `249f8daf-d0c8-41dc-8f9c-91a7d9cb7ff5` succeeded and deployed MCP version #10 (`8b7e8158-b175-44fe-98d5-4f151eef51f2`) in deployment `1c27f7ac-ee02-47a8-9b5e-b28044f7e526`.

Post-deployment checks confirmed:
- `IS_PREVIEW=false` in the live Worker version bindings.
- Production `/oauth/client-metadata.json` returns HTTP 404.
- Production `/health` remains `ok: true` with 51 tools.
- Protected-resource metadata still points to the production MCP resource and Auth issuer.

The isolated Preview Worker and its CIMD test document remain intact. **Rollback warning:** immediate rollback version #9 predates PR #52 and will re-expose the Preview metadata endpoint; if rollback is required, track and reapply the Preview gate before declaring the production interface clean.

## Operator-confirmed two-key production OAuth smoke — 2026-11-20

The operator confirmed that the deployed production OAuth flow was successfully exercised with two real SyrianFatora Workspace keys, referred to here only as `KEY_1` and `KEY_2`. The actual key values are intentionally not recorded.

For each key, the smoke used the first-party HTTPS Auth page and approved `mcp:read` only. The Authorization Code + PKCE flow completed and the authenticated MCP session successfully performed:
- `initialize`
- `notifications/initialized`
- `tools/list` (51-tool catalogue)
- `customers_list` with `per_page=1`

No create, update, or delete operation was performed. API key values, access tokens, and customer records are not included in this repository.

**Scope of this evidence:** this confirms successful access-token issuance and authenticated read-only MCP execution for both keys. It does not establish refresh-token rotation, client/ChatGPT-side revocation, or user-facing disconnect/replacement behavior. The historical smoke was performed before gates 1–5 were all formally closed; it is recorded as evidence, not as authorization to continue real-key testing out of sequence.

## Current NO-GO release gates

The ordered six-gate checklist is maintained in `docs/implementation-plan.md`. The historical two-key read-only smoke is recorded below. Do not run further real-key tests until all ordered gates are formally closed. Production write operations remain prohibited.

## Credential lifecycle finding — 2026-11-20

A source review confirmed that the API key is stored in provider-encrypted grant `props`, and token validation returns those properties only to the internal MCP Worker. Access-token revocation removes only that token; refresh-token revocation deletes the full grant and encrypted properties. Reauthorization creates an independent grant because no stable Workspace identifier is available; it does not automatically replace an earlier key.

**Superseded finding:** Auth v6 could issue a refresh token even when optional `offline_access` was not approved. PR #54 corrected this with a scope-aware token-exchange callback and added regression coverage. PR #54 is merged and the correction is deployed in Auth v8 (100% traffic). User-facing disconnect/replacement UX is still not implemented, and ChatGPT's disconnect/revocation behavior remains unverified. Further real Workspace-key testing remains NO-GO until the remaining ordered gates are closed.


## Latest deployment state after PR #54 — 2026-11-20

A read-only Cloudflare API inspection after PR #54 merged confirmed the following current deployments:

| Worker | Current version | Current deployment | Traffic | Deployment time (UTC) |
| --- | --- | --- | --- | --- |
| Auth `syrianfatora-auth` | v8 `25c25a69-9fb2-4c75-b07b-a1cf00a49532` | `4bd65dcd-240e-44f7-b2db-c025a0b51a05` | 100% | 2026-11-20 04:42:36 |
| MCP `syrianfatora-mcp` | v11 `a1dcd66c-1a5c-48d1-bc1d-f63b1962d950` | `01fa136b-96b9-436d-be33-165390c6a099` | 100% | 2026-11-20 04:32:59 |

Auth v8 was uploaded after PR #54 merge commit `75c8f0616f8eea1526d4bfda559a8fc9ce456525`. Its deployed version metadata confirms the production issuer, MCP resource URL, production KV and SQLite Durable Object bindings, and the presence of the HMAC secret binding (the secret value was not read). The merged Auth code applies the `offline_access`-aware refresh-token callback.

MCP v11's deployed bindings show `IS_PREVIEW=false`, the production `AUTH_SERVER` Service Binding, and the expected `RATE_LIMITER` Durable Object binding. MCP v10 remains the immediate rollback target and retains the Preview cleanup. MCP v9 remains unsafe as a direct rollback because it predates the Preview cleanup.

The Cloudflare deployment inspection confirms version assignment and traffic percentages. It is not a substitute for a post-deployment end-to-end OAuth smoke. No real Workspace key was used during this deployment inspection, and no additional customer operation was performed. The historical two-key read-only smoke remains the only real-key end-to-end evidence recorded here.
