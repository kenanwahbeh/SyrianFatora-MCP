# OAuth Authorization Worker

The separate OAuth 2.1 authorization server for the existing `syrianfatora-mcp` resource Worker. It does not replace the MCP service or expose another MCP endpoint.

## Responsibilities

- Implements OAuth Authorization Code with PKCE.
- Supports Client ID Metadata Documents and Dynamic Client Registration.
- Presents a first-party HTTPS authorization and consent page.
- Displays the requesting client, publisher information when available, redirect host, and requested scopes.
- Collects the SyrianFatora Workspace API key only through the HTTPS authorization form.
- Validates the key with read-only `GET /customers?per_page=1`.
- Stores the validated key only in Workers OAuth Provider encrypted grant `props`.
- Exposes OAuth authorization-server discovery and a minimal `/health` endpoint.
- Exports the `SyrianFatoraAuth` entrypoint used by the MCP Worker's internal Service Binding.

Possession of the Workspace API key is used as the initial proof of workspace access. It is not proof of a person's legal identity. The random OAuth subject identifies a grant, not a stable Workspace ID.

## Production identity

- Worker: `syrianfatora-auth`
- Issuer: https://syrianfatora-auth.kinan-api.workers.dev
- MCP resource: https://syrianfatora-mcp.kinan-api.workers.dev/mcp
- Service Binding entrypoint: `SyrianFatoraAuth`
- OAuth provider: `@cloudflare/workers-oauth-provider@1.2.4`

Production version IDs, KV/DO namespace identifiers, and rollback references belong in the [production migration runbook](../../docs/production-migration.md), not in this package overview.

## Authorization protections

Before validating a submitted API key, the authorization endpoint applies narrow abuse controls:

- IP attempt window: 7 attempts per 60 seconds.
- Credential-fingerprint attempt window: 2 attempts per 60 seconds.

These controls protect authorization submissions only. They do not meter normal MCP requests or replace SyrianFatora's own workspace quota enforcement.

The API-key validation call is read-only but consumes SyrianFatora API quota. A 403 can mean the key lacks `customers.read` permission or API access is disabled; it must not automatically be described as an invalid key.

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

## Security constraints

- Never put API keys, access tokens, refresh tokens, signing keys, or Cloudflare credentials in source control, URLs, logs, tests, or chat.
- Never log or expose `props.upstreamApiKey`.
- Do not create a separate plaintext KV record for the upstream key.
- Do not store raw API keys, IP addresses, or grant subjects in limiter records.
- Use `RATE_LIMIT_HMAC_SECRET` consistently across Auth and MCP; never read or print its value through operational diagnostics.

## Current lifecycle limitation

Auth v6 has a known refresh-token consent mismatch: the configured global refresh-token TTL may allow issuance even when optional `offline_access` was not approved. The scope-aware correction and regression tests are in draft PR #54 and are not deployed.

Provider-level revocation semantics have been reviewed, but client/ChatGPT-side disconnect behavior is not verified. User-facing disconnect and credential-replacement UX are not implemented. Reauthorizing creates an independent grant; it does not automatically replace or revoke an earlier grant.

A read-only production OAuth smoke succeeded with two real Workspace keys (`KEY_1` and `KEY_2`). It verified access-token issuance and authenticated read-only MCP calls, not refresh-token rotation or full revocation behavior. Further real-key testing remains NO-GO until the ordered release gates are closed. See the [implementation plan](../../docs/implementation-plan.md) and [production runbook](../../docs/production-migration.md).
