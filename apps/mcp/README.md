# MCP Resource Worker

The OAuth-protected MCP resource server for SyrianFatora. It preserves the existing production Worker identity, public endpoint, and 51-tool catalogue.

## Responsibilities

- Exposes the MCP endpoint and existing SyrianFatora tool catalogue.
- Validates OAuth access tokens through the Auth Worker's `AUTH_SERVER` Service Binding.
- Uses the upstream SyrianFatora API key only on the server side, from provider-encrypted grant properties.
- Enforces `mcp:read` for MCP access and read operations.
- Requires both `mcp:read` and `mcp:write` for create, update, and delete operations.
- Defines per-resource request schemas in `src/rest-contract.mjs`, aligned to the supplied `page.html` REST reference; unknown filters/body fields are rejected before forwarding.
- Validates documented field types, required fields, enums, date formats and quote/recurring date ordering.
- Maps `payments_delete` argument `void_reason` to the exact REST DELETE JSON body field `void_reason`.
- Applies bounded request handling and avoids returning the upstream API key in echoed responses.
- Validates tool-call arguments against each published `inputSchema` before forwarding a request.
- Validates browser `Origin` headers on `/mcp`; same-origin requests and explicitly configured origins are accepted, while absent Origin remains supported for native clients.
- Negotiates legacy MCP protocol versions `2025-11-25`, `2025-03-26`, and `2024-11-05`; unsupported subsequent version headers are rejected with HTTP 400. Older clients omitting the header default to `2025-03-26`.

## Production identity

- Worker: `syrianfatora-mcp`
- MCP endpoint: https://syrianfatora-mcp.kinan-api.workers.dev/mcp
- Authorization issuer: https://syrianfatora-auth.kinan-api.workers.dev
- Internal Auth binding: `AUTH_SERVER` → `syrianfatora-auth`, entrypoint `SyrianFatoraAuth`

Do not rename this Worker, create a replacement MCP service, or point production configuration at a Preview Worker. Deployed version IDs, bindings, and rollback references are maintained only in the [production migration runbook](../../docs/production-migration.md).

## Upstream quota behavior

SyrianFatora owns workspace API quota. The MCP Worker does not impose local per-key, per-grant, daily, or monthly request quotas and does not count normal MCP requests locally.

A credential-scoped cooldown is stored only when SyrianFatora returns HTTP 429 with a valid `Retry-After` value. The provider-specified duration is used without a local fallback. The Worker does not automatically retry upstream requests. The HMAC credential fingerprint is not a workspace identifier or usage counter.

## Browser Origin allowlist

The MCP endpoint accepts requests with no `Origin` header for non-browser clients. If a browser client sends `Origin`, the value must exactly match the MCP endpoint origin or an entry in the optional `MCP_ALLOWED_ORIGINS` Worker variable.

Set `MCP_ALLOWED_ORIGINS` to a comma-separated list of exact origins, including scheme and port where applicable (for example, `https://chat.example.com,https://app.example.com`). Paths, wildcards, opaque `null` origins, non-loopback HTTP origins, and non-canonical values are rejected. Determine the actual browser-client origin before configuring it; do not guess or broadly allow all origins. No production Worker variable or deployment is changed by this source change.

The Worker negotiates `2025-11-25`, `2025-03-26`, or `2024-11-05` during `initialize`; when a client requests an unknown version, it selects the latest supported legacy version. Subsequent requests reject unsupported `MCP-Protocol-Version` values with HTTP 400. For compatibility with clients predating the header, an omitted header defaults to `2025-03-26`. The newer stateless `2026-07-28` protocol is not implemented by this legacy request lifecycle.

## Development

Requirements: Node.js 20 or later and the package dependencies.

From this directory:

```sh
npm install
npm run build:check
npm test
npm run dev
```

The MCP production Build trigger runs `npm run deploy:version`, which uploads a Worker Version from the already validated Build Output without changing production traffic. It does **not** promote that version automatically. This is intentional while the existing Worker has script-API deployment history: do not use `cf deploy --force` to bypass the ownership conflict.

After a successful Build, inspect the uploaded version and its bindings in Cloudflare. Promote it only after an explicit release decision, using **Workers & Pages → syrianfatora-mcp → Deployments → Promote deployment**. Confirm the selected version and 100% traffic assignment, then run the read-only production smoke checks. Keep the previous known-good version available for rollback. Cloudflare documents this two-step workflow in [cf version upload and deployment commands](https://developers.cloudflare.com/cf/projects/) and [Worker deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/).

## Operator-run production OAuth smoke

Run:

```sh
npm run smoke:oauth
```

The script performs Authorization Code + PKCE against the deployed Auth Worker. It opens a local loopback callback listener, prints an authorization URL, and asks the operator to enter the Workspace API key only on the first-party HTTPS authorization page. Approve `mcp:read` only.

It then verifies:

1. Authorization-code exchange and Bearer access-token issuance.
2. Authenticated MCP `initialize`.
3. `notifications/initialized`.
4. `tools/list` and the expected 51-tool catalogue.
5. Read-only `customers_list` with `per_page=1`.

The script does not request `mcp:write`, perform writes, or print/persist the API key, access token, or customer records. API-key validation and the customer-list call consume provider read quota.

The script caches only the public OAuth client ID and redirect URI locally in `~/.syrianfatora-smoke/client.json` with restrictive file permissions. It does not cache credentials or tokens. The callback port defaults to `43127`.

Optional environment variables:

- `AUTH_ORIGIN` — authorization-server origin.
- `MCP_ORIGIN` — MCP resource-server origin.
- `SMOKE_CALLBACK_PORT` — loopback callback port.
- `SMOKE_CLIENT_CACHE` — local path for the non-secret client cache.

This is an operator-run production check, not a GitHub Actions job. The automated production workflow performs unauthenticated health/metadata checks and invalid-token rejection only. The local mocked integration test validates the script flow but is not evidence of a real production OAuth session.

The historical two-key read-only smoke (`KEY_1` and `KEY_2`) is recorded in the root README and production runbook. The operator authorized controlled real-key MCP testing on 2026-11-21 against the designated test workspace. Run `npm run test:live-keys` from this package to execute the full test runner, or `npm run test:live-keys -- --key KEY_1` / `--key KEY_2` for one read-only credential check. The single-key mode does not run any write operations. The runner reads `KEY_1`, `KEY_2`, and `KEY_3` from the repository-root `.env`; it does not print key values, access tokens, customer records, or API response bodies. `KEY_1` and `KEY_2` receive read-only scopes and run `customers_list` with `per_page=1`. `KEY_3` receives `mcp:read` and `mcp:write`, creates one clearly marked temporary item, updates and retrieves that same item, deletes only that item, and verifies it is absent. Each temporary OAuth grant requests `offline_access` solely so the runner can revoke the refresh token and remove the grant after the test. Workspace data operations are sent only as MCP `tools/call` requests; the runner does not call the SyrianFatora data API directly. This is controlled integration testing, not a full release-readiness sign-off. If the run fails before cleanup, inspect the warning and verify only the runner-created item; never delete unrelated records.

The root-level `scripts/live-mcp-skills-test.mjs` exercises all reversible resource lifecycles, cross-key reads, and safe negative probes. It intentionally skips successful customer/invoice/payment creation and real payment voids because those operations cannot be safely reversed. Use `--payment-methods-only` for the non-mutating payment-method inventory or `--cleanup-only` to remove only uniquely marked leftovers from this test harness. This runner targets the deployed MCP URL by default; the current Production deployment must be updated before its `void_reason` probe can pass.

## Preview

Preview is isolated from production. Keep its Worker separate; do not remove Preview resources as part of production metadata cleanup. The production metadata endpoint `/oauth/client-metadata.json` is gated to return 404.
