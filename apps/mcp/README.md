# MCP Resource Worker

The OAuth-protected MCP resource server for SyrianFatora. It preserves the existing production Worker identity, public endpoint, and 51-tool catalogue.

## Responsibilities

- Exposes the MCP endpoint and existing SyrianFatora tool catalogue.
- Validates OAuth access tokens through the Auth Worker's `AUTH_SERVER` Service Binding.
- Uses the upstream SyrianFatora API key only on the server side, from provider-encrypted grant properties.
- Enforces `mcp:read` for MCP access and read operations.
- Requires both `mcp:read` and `mcp:write` for create, update, and delete operations.
- Preserves existing tool request/response semantics, including the payment-void reason requirement.
- Applies bounded request handling and avoids returning the upstream API key in echoed responses.
- Validates browser `Origin` headers against the exact `MCP_ALLOWED_ORIGINS` allowlist; native clients without an `Origin` header remain supported.
- Requires a supported `MCP-Protocol-Version` header on every POST after `initialize`.
- Validates tool-call arguments against each published `inputSchema` before forwarding a request.
- Validates browser `Origin` headers on `/mcp`; requests without `Origin` remain supported for non-browser MCP clients.
- Negotiates only the supported MCP protocol versions (`2025-03-26` and `2024-11-05`) and rejects unsupported version headers.

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

Set `MCP_ALLOWED_ORIGINS` to a comma-separated list of exact origins, including scheme and port where applicable (for example, `https://chat.example.com,https://app.example.com`). Paths, wildcards, opaque `null` origins, and non-canonical values are rejected. Determine the actual browser-client origin before configuring it; do not guess or broadly allow all origins. No production Worker variable or deployment is changed by this source change.

## MCP browser-origin configuration

Set `MCP_ALLOWED_ORIGINS` to a comma-separated list of exact HTTPS origins permitted to call `/mcp` from browsers. Do not include paths or trailing slashes. An empty allowlist rejects browser-originated MCP requests with HTTP 403; requests without an `Origin` header remain supported for native MCP clients. Loopback HTTP origins are accepted only when explicitly allowlisted for local development. Configure the production allowlist for the intended MCP client before deploying this change.

The Worker negotiates `2025-03-26` or `2024-11-05` during `initialize`. All subsequent POST messages must carry the negotiated value in `MCP-Protocol-Version`; missing or unsupported values are rejected with HTTP 400.

## Development

Requirements: Node.js 20 or later and the package dependencies.

From this directory:

```sh
npm install
npm run build:check
npm test
npm run dev
```

The production deployment command is managed by the Cloudflare Build trigger. Do not deploy manually or use `--force` unless a separate production change has been explicitly approved.

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

The two-key production read-only smoke (`KEY_1` and `KEY_2`) is recorded in the root README and production runbook. Further real-key tests remain NO-GO until release gates 1–5 are formally closed. Never test write operations against a real Workspace.

## Preview

Preview is isolated from production. Keep its Worker separate; do not remove Preview resources as part of production metadata cleanup. The production metadata endpoint `/oauth/client-metadata.json` is gated to return 404.
