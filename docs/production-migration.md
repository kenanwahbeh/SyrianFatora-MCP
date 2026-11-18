# Production migration runbook and execution log

**Last updated:** 2026-11-18  
**Status:** Preparation in progress. One production KV namespace has been created; no Worker code, binding, route, DNS, or deployment has been changed.

## Agreed outcome

Migrate the existing Cloudflare MCP resource Worker in place. Keep the exact production service name `syrianfatora-mcp`, preserve its public MCP endpoint identity and its 51 tools. Add a separate OAuth authorization Worker named `syrianfatora-auth`, connected by Service Binding `AUTH_SERVER` → `SyrianFatoraAuth`. Do not create a replacement MCP Worker.

The user has asked to defer automated tests for this immediate migration. This is a recorded exception, not a passing test result. Only read-only production probes are permitted.

## Current production baseline — read-only inspection

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

**Important:** the candidate URL is derived from Cloudflare's account subdomain and Worker name, but an HTTP endpoint probe has not yet been completed. Do not mark it verified until a direct HTTPS request confirms it.

## Exact rollback source verification

The currently deployed Worker script was retrieved read-only from Cloudflare. Its extracted JavaScript content matched byte-for-byte with the repository archive:

- Repository archive: `src/worker-v1.1.0.mjs`
- Archive blob SHA: `a93e1c254efb2a840c951f1a7326e28432e8f561`
- Extracted live script length: 9,960 characters
- Archived script length: 9,960 characters
- Exact content comparison: **MATCH**

This verifies the source-code archive against the live script. It does not by itself preserve all Worker metadata or deployment configuration. Before deployment, also capture the current settings, bindings, version details, and deployment metadata; current settings are recorded above.

## Previous failed deployment — 2026-11-18

The Cloudflare Build completed checkout, dependency installation, and `npm run build:check`, then aborted during deploy.

The reported conflict was:

- Configured Worker name: `syrianfatora-mcp-oauth-preview`
- Cloudflare CI target Worker: `syrianfatora-mcp`
- The live Worker was last updated through the script API.
- Cloudflare warned that a CLI upload would override script-API edits and aborted, suggesting `cf deploy --force`.

No successful production overwrite was reported from this failed build. Do not treat the failed deployment as an applied release. Do not use `--force` as a blind workaround.

## Configuration still required

1. Verify the candidate MCP HTTPS endpoint directly.
2. Use the verified account workers.dev subdomain `kinan-api` for the auth origin unless an already-owned custom domain is deliberately selected. Candidate auth origin: `https://syrianfatora-auth.kinan-api.workers.dev`; direct HTTPS probe is still required after deployment.
3. Production KV namespace has now been created for the auth Worker's `OAUTH_KV` binding. Namespace: `syrianfatora-oauth-production`; ID: `d19d9bd755c349f688cd55e299b8168f`.
4. Update `apps/auth/cloudflare.config.ts`:
   - Worker name `syrianfatora-auth`
   - `ISSUER` exact public HTTPS auth origin
   - `MCP_SERVER_URL` exact MCP URL including `/mcp`
   - `OAUTH_KV` production namespace ID
5. Update `apps/mcp/cloudflare.config.ts`:
   - Worker name exactly `syrianfatora-mcp`
   - `MCP_SERVER_URL` exact public HTTPS MCP URL including `/mcp`
   - `AUTH_SERVER_URL` exact issuer origin
   - `AUTH_SERVER` Service Binding to `syrianfatora-auth`, entrypoint `SyrianFatoraAuth`
6. The current Cloudflare Build trigger is recorded below. Confirm its root directory, build command, deploy command, and target Worker name all agree with the config. Do not let a docs-only branch trigger a production deployment.
7. Deploy the auth Worker, record its deployment/version IDs, then migrate the existing MCP Worker in place.
8. Run read-only health, OAuth metadata/discovery, invalid-token, initialize, and tools/list probes. Do not perform create/update/delete calls against a real workspace.
9. Update this log with actual results and the final rollback identifiers.

## Existing Cloudflare Build trigger

Read-only inspection of the trigger attached to the existing MCP script tag:

- Script tag: `80f433e8c9db45adba9d8df05ff403d8`
- Trigger ID: `593221cf-b17a-4506-979a-ebb7f4307c69`
- Repository: `kenanwahbeh/SyrianFatora-MCP`
- Watched branch: `main`
- Root directory: `/apps/mcp`
- Build command: `npm run build:check`
- Deploy command: `npx cf deploy --prebuilt --mode production`
- Included paths: `apps/mcp/**`, `apps/mcp/package.json`, `apps/mcp/package-lock.json`
- Excluded paths: none

The docs-only branch/PR does not match the trigger's included paths, so these documentation changes do not start the production MCP build. There is no separate auth Worker Build trigger recorded yet.

## Execution log

| Time (UTC) | Action | Result |
| --- | --- | --- |
| 2026-11-18 | Inspected production Worker settings, versions, deployments, domains, workers.dev subdomain, and KV namespaces | Read-only; completed |
| 2026-11-18 | Retrieved live `syrianfatora-mcp` script and compared with `src/worker-v1.1.0.mjs` | Exact source match |
| 2026-11-18 | Checked Cloudflare KV namespace list | Initially empty |
| 2026-11-18 | Created KV namespace `syrianfatora-oauth-production` | Created; ID `d19d9bd755c349f688cd55e299b8168f`; not yet bound to a Worker |
| 2026-11-18 | Inspected existing Cloudflare Build trigger | Root `/apps/mcp`; build `npm run build:check`; deploy `npx cf deploy --prebuilt --mode production`; branch `main`; only `apps/mcp/**` and its package manifests trigger it |
| 2026-11-18 | Attempted to merge documentation PR #13 | GitHub blocked merge while CodeQL results were pending; no bypass attempted |
| 2026-11-18 | Checked existing Worker domains | No MCP custom domain found |
| 2026-11-18 | Reviewed previous Cloudflare Build failure | Deployment aborted on Worker-name/script-API conflict |
| 2026-11-18 | Changed existing MCP Worker code, bindings, routes, DNS, or deployment | **No changes made** |

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
