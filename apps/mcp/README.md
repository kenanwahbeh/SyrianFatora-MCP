# MCP Resource Worker

OAuth-protected MCP resource server for the SyrianFatora public REST API. The production Worker identity remains `syrianfatora-mcp`.

## Responsibilities

- Publishes the MCP tool catalogue generated from the resource/action registry in `src/handler.mjs`.
- Validates OAuth access tokens through the Auth Worker's `AUTH_SERVER` Service Binding.
- Uses the upstream Workspace API key only from provider-encrypted OAuth grant properties.
- Requires `mcp:read` for MCP access and reads; create/update/delete additionally require `mcp:write`.
- Defines strict per-resource request contracts in `src/rest-contract.mjs`; unknown query/body fields are rejected before forwarding.
- Validates generic tool arguments in `src/input-validation.mjs`.
- Maps `payments_delete` argument `void_reason` to the exact REST DELETE JSON field `void_reason`.
- Applies request-size limits, upstream timeout, manual redirect handling, credential redaction and no-store responses.
- Validates browser Origin values; native clients without an Origin header remain supported.
- Supports MCP protocol versions `2025-11-25`, `2025-03-26`, and `2024-11-05`; subsequent unsupported version headers receive HTTP 400.

## Production identity

- Worker: `syrianfatora-mcp`
- MCP endpoint: https://syrianfatora-mcp.kinan-api.workers.dev/mcp
- Authorization issuer: https://syrianfatora-auth.kinan-api.workers.dev
- Binding: `AUTH_SERVER` → `syrianfatora-auth`, entrypoint `SyrianFatoraAuth`
- Binding: `RATE_LIMITER` → `CredentialRateLimiter` in `syrianfatora-auth`

Do not rename this Worker, create a replacement public MCP service, or point production configuration at a Preview Worker. Current production version/deployment and rollback evidence is maintained only in [the production runbook](../../docs/production-migration.md).

## MCP tool catalogue

The current source defines 51 tools across 12 resources. The live `tools/list` response is authoritative. Customers and invoices expose list/get/create only; payment methods expose list only and have no query or pagination. Do not infer operations from the upstream REST API.

## Upstream quota and cooldown

SyrianFatora owns Workspace API quota. The MCP Worker does not impose local per-key, per-grant, daily or monthly request quotas and does not count normal MCP requests locally.

A credential-scoped cooldown is stored only when SyrianFatora returns HTTP 429 with a valid `Retry-After` value. The provider-specified duration is used without a local fallback. The Worker does not automatically retry upstream requests. The HMAC credential fingerprint is not a Workspace identifier or usage counter.

## Browser Origin allowlist

Requests without an `Origin` header are supported for non-browser clients. If a browser client sends `Origin`, it must exactly match the MCP endpoint origin or an entry in `MCP_ALLOWED_ORIGINS`.

Set `MCP_ALLOWED_ORIGINS` to comma-separated exact origins including scheme and port where applicable. Paths, wildcards, opaque `null` origins, non-loopback HTTP origins and non-canonical values are rejected. Determine the real browser origin before configuring it; do not guess or broadly allow all origins.

## Development

Requirements: Node.js 20 or later.

From this directory:

```sh
npm ci
npm audit --audit-level=high
npm run build:check
npm test
npm run dev
```

The latest successful production Build on 2026-11-21 ran the audit, build check and 53 MCP tests before deploying v16. This is MCP package evidence; it does not mean the separate Auth test suite ran in that Build.

## Version upload and production promotion

The MCP Build trigger's permanent deploy command is:

```sh
npx cf workers versions create --prebuilt --mode production
```

The equivalent package script is `npm run deploy:version`. This uploads a Worker Version from the validated Build output without changing production traffic. It does **not** promote that version automatically.

Promotion is a separate, explicitly approved action. Inspect the uploaded version and bindings, promote through **Workers & Pages → syrianfatora-mcp → Deployments**, confirm the intended version and 100% traffic assignment, then perform the post-deployment smoke checks. Keep the previous known-good version available for rollback.

A one-time migration deployment used `npx cf deploy --prebuilt --mode production --force` after explicit operator approval to resolve the existing Script API ownership conflict. The permanent Build trigger was restored immediately to the version-upload-only command and read back. Never use `--force` as the routine deployment path or in an automatic trigger.

## Operator-run OAuth smoke

Run:

```sh
npm run smoke:oauth
```

This script performs Authorization Code + PKCE using a local loopback callback, registers or reuses a public OAuth client, and asks the operator to approve `mcp:read`. It then exchanges the code and verifies authenticated MCP initialization, notifications/initialized, tools/list and a read-only `customers_list` request. It does not request `mcp:write`, create or update business data, or print/persist the Workspace API key or tokens. The read-only validation and list request consume upstream quota.

It caches only the public OAuth client ID and redirect URI in `~/.syrianfatora-smoke/client.json` with restrictive permissions. The callback port defaults to `43127`.

Optional environment variables: `AUTH_ORIGIN`, `MCP_ORIGIN`, `SMOKE_CALLBACK_PORT`, and `SMOKE_CLIENT_CACHE`.

## Controlled live-key tests

`npm run test:live-keys` invokes `scripts/live-mcp-key-test.mjs`. It reads `KEY_1`, `KEY_2` and `KEY_3` from the repository-root `.env`, requests OAuth scopes according to the selected test mode, and sends MCP tool calls. Never run it casually against a customer workspace. Review the script before each use and require explicit approval for the designated test workspace. It may perform temporary write lifecycles depending on the selected key/mode; cleanup and grant revocation must be verified.

The root script `scripts/live-mcp-skills-test.mjs` exercises reversible resource lifecycles and safe negative probes. It intentionally avoids successful customer/invoice/payment creation and real payment voids. Its cleanup mode may delete only uniquely marked records created by this test harness. Use only with explicit approval and the dedicated test workspace.

The historical payment-void probe against the pre-v16 deployment was rejected because that version expected `reason`. Source now requires `void_reason`, and v16 contains the fix. A post-v16 authenticated smoke/void-negative probe has not yet been recorded. If separately authorized, use a clearly nonexistent payment ID and the required `void_reason`; never test by voiding a real payment.

## Preview

Preview is isolated from production. Keep its Worker separate; do not remove Preview resources as part of production cleanup. The production `/oauth/client-metadata.json` endpoint is gated to return 404.
