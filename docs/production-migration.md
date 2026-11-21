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

## Current Auth production deployment

| Item | Verified value |
| --- | --- |
| Worker | `syrianfatora-auth` |
| Issuer | `https://syrianfatora-auth.kinan-api.workers.dev` |
| Version | v12 |
| Version ID | `cea33cf9-7b2f-48af-81c2-183f434cec3f` |
| Deployment ID | `78068e28-2c1a-4b06-9a82-54739cda17e7` |
| Traffic | 100% to v12 |
| Previous version | v11 — `b0c0df89-1adc-4911-b689-753c45f9f35a` |
| Previous deployment | `ca5bf43c-3e07-4eb2-b6ba-d6c477b02617` |
| OAuth KV | `syrianfatora-oauth-production` — `d19d9bd755c349f688cd55e299b8168f` |
| Durable Object namespace | `1303fb3e6d25453080035c0356b4d4bd` |

Cloudflare deployment/version records were read on 2026-11-21. The current Auth deployment is v12, not v8 or v11. The MCP v16 Build did not build or deploy Auth; Auth has its own independent release history. Both workers' production settings and bindings were inspected and matched the current source configuration. No production setting changes were needed in that inspection.

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

## Production endpoint checks

The two `/health` endpoints are intentionally public, read-only liveness checks:

- MCP: `GET https://syrianfatora-mcp.kinan-api.workers.dev/health` → expected HTTP 200 and JSON with `ok: true`, `service: "syrianfatora-mcp"`, `mode: "oauth-resource-server"`, and `toolCount: 51`.
- Auth: `GET https://syrianfatora-auth.kinan-api.workers.dev/health` → expected HTTP 200 and JSON with `ok: true`, `service: "syrianfatora-auth"`, and `version: "0.1.0"`.

These checks prove that the public Worker route responds; they do not prove OAuth token validation, the Service Binding, or upstream API connectivity.

### Quick checks from Windows PowerShell

Use `curl.exe` (not PowerShell's historical `curl` alias):

```powershell
curl.exe -i https://syrianfatora-mcp.kinan-api.workers.dev/health
curl.exe -i https://syrianfatora-auth.kinan-api.workers.dev/health
```

For both, expect `HTTP/1.1 200` (or `HTTP/2 200`) and the JSON fields above. A non-200 response should be recorded with its status and sanitized response body; do not paste credentials or tokens.

### MCP protocol check

`/mcp` is not a browser health page. It is a JSON-RPC endpoint and its normal method is **POST**. A request without a Bearer token should be rejected with HTTP 401 and an OAuth `WWW-Authenticate` challenge; this is an expected authentication check, not a successful MCP session.

From PowerShell, test the protected route without a token:

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"manual-smoke","version":"1.0"}}}'
curl.exe -i -X POST "https://syrianfatora-mcp.kinan-api.workers.dev/mcp" `
  -H "Content-Type: application/json" `
  -H "Accept: application/json, text/event-stream" `
  -H "MCP-Protocol-Version: 2025-03-26" `
  --data-raw $body
```

Expected: HTTP 401 because no access token was supplied. Do not use `GET /mcp` as the MCP protocol test; a normal MCP exchange uses POST.

### Full authenticated, read-only smoke

The repository includes an operator-run Authorization Code + PKCE test. On a machine with Node.js 20+ and the repository cloned:

```powershell
cd apps/mcp
npm ci
npm run smoke:oauth
```

The script prints an authorization URL. Open it in a browser, verify the requesting client and redirect host, select only `mcp:read`, and enter the Workspace API key only on the official HTTPS Auth page. Never send the key or issued token in chat or terminal output. The script then checks:

1. OAuth authorization and code exchange.
2. Authenticated MCP `initialize`.
3. `notifications/initialized`.
4. Authenticated `tools/list` and exactly 51 tools.
5. Read-only `customers_list` with `per_page=1`.

This last step consumes SyrianFatora API quota and may return limited workspace data to the local test process; the script does not print customer records or credentials. Run it only with an explicitly approved test workspace/key. It does not create or modify business records and does not request `mcp:write`.

### Evidence status as of 2026-11-21

- Cloudflare API confirmed MCP v16 at 100% production traffic and Auth v12 at 100% production traffic.
- MCP Build v16 completed the audit/build check and 53 MCP unit tests successfully.
- Production settings and bindings for both Workers were inspected and matched source.
- A live HTTP request from the connected execution environment could not be completed because outbound HTTP access was blocked before reaching the Workers. This is **not evidence of a Worker failure**.
- No successful post-v16 authenticated MCP smoke is recorded yet. Complete the Windows checks above and append timestamp, status codes, MCP server version, tool count and sanitized outcome. Never include credentials, tokens or customer records.

## Rollback

The immediately previous MCP version recorded before v16 is v15 (`5469a3d0-9b01-4803-ad00-4c6813df3e2c`), deployment `6d82978e-52cd-4442-a05c-cc9d8b595668`. Before rollback, inspect the current Cloudflare deployment list and confirm v15 remains available with expected bindings/configuration. Do not act on this historical note alone; explicit operator approval is required.

The immediately previous Auth version to current v12 is v11 (`b0c0df89-1adc-4911-b689-753c45f9f35a`), deployment `ca5bf43c-3e07-4eb2-b6ba-d6c477b02617`. Verify availability and bindings before any action; explicit operator approval is required.

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
