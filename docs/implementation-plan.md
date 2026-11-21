# Implementation status and release gates

**Updated:** 2026-11-21

## Current verified state

The current source on `main` contains the OAuth-protected MCP resource server and the separate OAuth authorization Worker. The MCP Worker was deployed to production as version v16 on 2026-11-21.

| Item | Verified value |
| --- | --- |
| Repository | `kenanwahbeh/SyrianFatora-MCP` |
| Main source commit deployed | `7cfa1e84d7e825aa08bf4b8f5b10c5b18b7c106a` |
| MCP Worker | `syrianfatora-mcp` |
| MCP version | v16 |
| MCP version ID | `bfe9cbad-f08c-4f67-9fc9-23136fe9f2ae` |
| MCP deployment ID | `9a33a35e-d8ab-473b-8e33-51a13b346a8c` |
| Traffic assignment | 100% to v16 |
| MCP endpoint | `https://syrianfatora-mcp.kinan-api.workers.dev/mcp` |
| Auth issuer | `https://syrianfatora-auth.kinan-api.workers.dev` |
| MCP tools in source | 51 across 12 resources |
| MCP Build | `72694a25-7494-4775-8f2c-9a2b069f78e5`, success |
| MCP tests in that Build | 53 passed, 0 failed |
| Build audit/build check | completed successfully |
| Post-v16 authenticated MCP smoke | Not yet recorded |

The Build log confirmed the MCP upload, Worker deployment, 6 ms startup time, and the `AUTH_SERVER` and `RATE_LIMITER` bindings. A successful Build/deployment is not evidence that authenticated MCP operations have passed after v16.

The Auth Worker was last documented as v8 in the earlier production record. The v16 Build was MCP-only and did not rebuild or redeploy Auth. Consult the production runbook before relying on Auth version metadata.

## Implemented capabilities

- [x] Preserve the production MCP Worker identity and endpoint.
- [x] Separate OAuth authorization service using Authorization Code + PKCE.
- [x] Dynamic Client Registration and Client ID Metadata Document support.
- [x] Required `mcp:read` and optional write scope enforcement.
- [x] Optional `offline_access`-aware refresh-token issuance.
- [x] Provider-encrypted OAuth grant properties for upstream credentials.
- [x] Isolated grants; no inferred Workspace identity or implicit grant replacement.
- [x] Strict REST request schemas for 12 resources.
- [x] Exact payment void request field `void_reason`.
- [x] Authorization-attempt abuse protection and provider-directed 429 cooldown.
- [x] MCP request validation, origin checks, size bounds, timeout and credential redaction.
- [x] Independent Auth and MCP test/build workflows.

## Outstanding verification and product work

- [ ] Run post-v16 read-only production smoke: health, protected-resource metadata, invalid-token rejection, OAuth discovery, authenticated initialize and tools/list.
- [ ] Run a safe authenticated read-only tool check only with an explicitly approved test credential/workspace.
- [ ] Verify the production Auth Worker version/bindings if any Auth change is proposed; the MCP-only Build does not establish Auth deployment state.
- [ ] Verify actual ChatGPT/client RFC 7009 revocation behavior.
- [ ] Define user-facing disconnect and credential-replacement management.
- [ ] Decide whether a trustworthy stable Workspace identifier is available before implementing cross-grant replacement.

## Deployment policy

The MCP Build trigger's permanent command is `npx cf workers versions create --prebuilt --mode production`. It uploads an immutable version without assigning production traffic. Promotion is a separate action requiring explicit operator approval.

A one-time migration used `cf deploy --prebuilt --mode production --force` after explicit approval because the existing Worker had Script API deployment ownership. The trigger was restored to the version-only command and verified. Do not make `--force` a routine or automatic deployment path.

## Test evidence rules

- The MCP v16 Build ran 53 MCP tests successfully.
- Auth has a separate test workflow and package; do not claim an MCP Build ran Auth tests.
- Mocked tests are not live production OAuth evidence.
- A deployment confirmation is not an authenticated end-to-end smoke result.
- Live write tests require explicit authorization for the designated test workspace, uniquely marked temporary data, a verified cleanup path and grant revocation. Never test by creating a customer, invoice or payment that cannot be safely removed; never void a real payment.

Detailed production identifiers and the historical change log are in [production-migration.md](production-migration.md).
