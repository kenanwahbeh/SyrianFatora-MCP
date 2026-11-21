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

Production baseline verified from Cloudflare on 2026-11-21:

- Version: **v12**
- Version ID: `cea33cf9-7b2f-48af-81c2-183f434cec3f`
- Deployment ID: `78068e28-2c1a-4b06-9a82-54739cda17e7`
- Traffic: 100% to v12
- Previous version: v11 — `b0c0df89-1adc-4911-b689-753c45f9f35a`
- Previous deployment: `ca5bf43c-3e07-4eb2-b6ba-d6c477b02617`

The MCP v16 deployment is separate. Do not infer Auth version changes from MCP builds. The [production migration runbook](../../docs/production-migration.md) is the canonical deployment/rollback record.

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
npm ci
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

## Token lifecycle

PR #54 introduced the token-exchange callback, present in the current Auth source and production baseline: refresh tokens are issued only when `offline_access` is in the effective requested scope. The Auth test suite covers the no-refresh case, refresh-token rotation, grant isolation, access-token revocation, and full grant revocation through refresh-token revocation.

Revoking an access token removes that token but does not itself delete the grant or encrypted key. Revoking a refresh token revokes the grant and its encrypted properties.

## Remaining product limitation

Provider-level token lifecycle behavior is implemented and source-tested. Actual ChatGPT/client disconnect behavior is not verified. A user-facing disconnect or credential-replacement management page is not implemented. Reauthorizing creates an independent grant; it does not automatically replace or revoke an earlier grant because no stable Workspace identifier is available.

A read-only production OAuth smoke succeeded with two real Workspace keys (`KEY_1` and `KEY_2`) in earlier testing. The MCP v16 deployment on 2026-11-21 has not yet had a successful authenticated post-deployment functional smoke recorded. The current Auth v12 baseline must not be described as having passed a fresh live OAuth smoke solely because its version and deployment are visible in Cloudflare. See the [implementation plan](../../docs/implementation-plan.md), [credential lifecycle review](../../docs/credential-lifecycle-review.md), and [production runbook](../../docs/production-migration.md).
