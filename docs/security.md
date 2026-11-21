# Security model and threat controls

## Credential boundary

- Collect the SyrianFatora Workspace API key only on the first-party HTTPS authorization page.
- Validate it using read-only `GET /customers?per_page=1`.
- Store it only in Workers OAuth Provider encrypted grant properties; do not create a plaintext KV copy.
- Return decrypted grant properties only to the authenticated resource Worker through the OAuth provider flow.
- Never expose or log API keys, access/refresh tokens, authorization codes, webhook secrets, request bodies containing credentials or Authorization headers.
- Do not put credentials in URLs, browser storage, analytics, source control or plugin configuration.

A random OAuth subject identifies a grant, not a person or stable Workspace. Reauthorization creates a separate grant; it does not replace another grant automatically.

## OAuth and scopes

- Authorization Code with PKCE.
- Validate client metadata, redirect URI, state, resource and PKCE challenge.
- Consent page identifies the client, redirect host and requested scopes.
- `mcp:read` is required; `mcp:write` is optional and required for write tools.
- `offline_access` is optional. The token-exchange callback suppresses refresh-token issuance unless it is in the effective requested scope.
- Validate token audience and scopes on every MCP request.
- Provider-level refresh-token rotation and revocation are covered by Auth tests. Actual ChatGPT/client disconnect behavior remains unverified.

## Request validation and upstream handling

- Strict per-resource query/body contracts are defined in `apps/mcp/src/rest-contract.mjs`.
- Unknown fields and unsupported types/enums are rejected before forwarding.
- Bound MCP request and upstream response body sizes.
- Apply upstream request timeout and manual redirect handling.
- Redact the upstream API key from response text and never log raw exception objects or request bodies containing credentials.
- Use no-store responses and conservative CORS/Origin validation.
- Payment void is a soft-void action and requires `void_reason`; never describe it as physical deletion.

## Abuse protection and provider quota

SyrianFatora owns Workspace API quota. Do not impose local per-key, per-grant, daily or monthly MCP request quotas.

Auth has two narrow authorization-submission protections:
1. IP-based attempt window: 7 attempts per 60 seconds.
2. Credential-fingerprint attempt window: 2 attempts per 60 seconds.

These protect repeated authorization submissions only. They do not meter normal MCP requests.

The MCP Worker checks a credential-scoped cooldown only after SyrianFatora returns HTTP 429 with a valid `Retry-After`. Use the provider-specified wait exactly. Do not invent a fallback duration or automatically retry. If the header is absent or invalid, do not create a local cooldown. Preserve provider quota headers when available.

The HMAC credential fingerprint is not a Workspace ID or usage counter. Never store raw API keys, IP addresses or grant subjects in limiter records.

## Production change safeguards

- Preserve the Worker name `syrianfatora-mcp`.
- Keep Auth as a separate supporting Worker, not a replacement MCP endpoint.
- Never modify DNS/custom domains or production bindings/secrets without a separately approved change.
- The normal MCP Build deploy command is version upload only: `cf workers versions create --prebuilt --mode production`.
- A one-time migration used `cf deploy --prebuilt --mode production --force` after explicit operator approval. This was a specific migration exception, not a reusable deployment policy.
- Production promotion requires separate approval and a verified rollback target.
- Never perform irreversible live write tests. Live write tests require explicit approval, a designated test workspace and verified cleanup.

## Current production evidence

MCP v16 was deployed on 2026-11-21 with 100% traffic assignment. The Build completed the dependency audit, build check and 53 MCP tests. Cloudflare logs confirmed the `AUTH_SERVER` and `RATE_LIMITER` bindings.

A post-v16 authenticated production MCP smoke has not yet been recorded. Do not equate a successful deployment with end-to-end OAuth/MCP verification. See [the production runbook](production-migration.md).
