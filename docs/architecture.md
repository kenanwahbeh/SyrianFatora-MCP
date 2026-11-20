# Architecture

## Decision: preserve the existing MCP Worker and split OAuth authorization

**Decision date:** 2026-11-18  
**Status:** Implemented and deployed. Real Workspace-key OAuth end-to-end verification remains outstanding; release readiness is NO-GO.

Migrate the existing production MCP resource Worker **in place**. Its Cloudflare service name remains exactly `syrianfatora-mcp`; its existing public MCP endpoint identity and 51-tool catalogue are to be preserved. Do not create a replacement MCP resource Worker.

Workers OAuth Provider v1 separates the authorization server from the resource server. Therefore, deploy one additional authorization Worker named `syrianfatora-auth`. This is an OAuth dependency, not a replacement MCP service. The existing MCP Worker validates access tokens through a Cloudflare Service Binding to the auth Worker's `SyrianFatoraAuth` entrypoint.

## Intended request flow

1. The MCP client requests protected-resource metadata from the existing MCP endpoint.
2. The metadata identifies the production authorization issuer.
3. The user is redirected to the `syrianfatora-auth` HTTPS authorization page.
4. The authorization Worker validates the OAuth request, client, redirect URI, resource audience, state, and PKCE challenge.
5. The user enters the SyrianFatora workspace API key on the first-party HTTPS page and reviews the requested permissions.
6. The auth Worker validates the key using the harmless read-only `GET /customers?per_page=1` endpoint.
7. Workers OAuth Provider completes Authorization Code + PKCE and issues a token scoped to the MCP resource.
8. The existing `syrianfatora-mcp` Worker validates the token using the internal Service Binding and receives the trusted grant properties.
9. The MCP Worker calls `https://syrianfatora.com/api/public/v1` with the upstream Bearer key held server-side.
10. The API key is never returned to the MCP client or browser after authorization.

## Components

- **Existing `syrianfatora-mcp` Worker:** retained production resource service; MCP endpoint, 51 tools, upstream API adapter, scope enforcement, token validation.
- **New `syrianfatora-auth` Worker:** OAuth authorization server, consent/onboarding page, client registration/discovery, token issuance and validation entrypoint.
- **Service Binding:** `syrianfatora-mcp.AUTH_SERVER` targets `syrianfatora-auth`, entrypoint `SyrianFatoraAuth`; no public network hop for token validation.
- **Workers OAuth Provider:** pinned `@cloudflare/workers-oauth-provider@1.2.4`.
- **KV:** authorization Worker `OAUTH_KV` binding for provider-managed grants, authorization codes, and token state.
- **Credential handling:** upstream API key is passed only in provider-encrypted grant `props`; do not create a separate plaintext KV record.
- **MCP client/plugin:** contains only the verified existing MCP URL and OAuth connection metadata, never user-specific secrets.

## Production URL and resource identity

The verified production MCP resource URL is `https://syrianfatora-mcp.kinan-api.workers.dev/mcp`. The verified issuer is `https://syrianfatora-auth.kinan-api.workers.dev`. The resource URL, issuer, OAuth `resources` value, MCP `resourceMetadata.resource`, and client-discovered endpoint must match exactly. Live read-only probes and current Worker configuration confirm these identities; do not replace them with guessed subdomains or custom domains.

## Identity and tenancy

Every authorization grant maps to one SyrianFatora credential/workspace. Use a unique server-side grant subject. Do not treat the random OAuth subject as proof of a human identity or workspace ID. Enforce grant isolation on every request. Never trust a client-supplied workspace label as identity.

## Upstream quota and abuse controls

SyrianFatora is the sole authority for workspace API quota and usage enforcement. The MCP integration must not create a competing per-API-key request budget, per-OAuth-grant request budget, or local daily/monthly quota. Every eligible MCP tool call is forwarded to SyrianFatora unless the provider has explicitly instructed the integration to wait through a 429 response and its Retry-After value.

The authorization Worker retains narrow anti-abuse controls only:
- IP-based protection against repeated authorization submissions.
- Credential-fingerprint protection against repeated API-key validation attempts during authorization.
These controls protect the authorization endpoint; they do not count or cap normal MCP API usage and must not be described as workspace quota enforcement.

The MCP Worker performs no local request counting. It may retain a credential-scoped cooldown only after SyrianFatora itself returns 429 with a valid Retry-After value. The cooldown duration comes directly from that header; no fallback duration or locally invented quota is applied. No automatic retry is performed. If Retry-After is absent or invalid, do not invent a wait period.

The HMAC secret remains necessary for privacy-preserving identities used by authorization anti-abuse protection and the provider-directed cooldown. Raw API keys and IP addresses must never be stored in limiter identifiers or logs. The random OAuth grant subject is not a workspace identity and is not used for quota accounting.

The existing SQLite Durable Object is therefore an authorization-abuse guard and provider-directed cooldown store, not a quota coordinator. It must not charge an event for ordinary MCP requests. Production rollout must not be blocked on selecting local workspace quota thresholds or proving cross-key workspace aggregation; provider quota is authoritative.

## MCP compatibility

Preserve all 51 existing tool names, schemas, upstream paths, and request semantics. Enforce `mcp:read` for MCP access and `mcp:write` for create/update/delete operations. Do not change business behavior as part of the authentication migration.

## Rollback principle

Before changing the live MCP Worker, preserve the exact deployed script, metadata/bindings, version ID, and deployment ID. The legacy `1.1.0` source archive is useful but is not by itself proof of an exact rollback: rollback must restore the complete deployed artifact/configuration. Keep the auth Worker deployment and MCP Worker migration as separately identifiable steps.

## Non-goals for this migration

- Replacing or renaming the MCP Worker.
- Creating a second public MCP endpoint.
- Rewriting the existing tool catalogue.
- Webhooks, multi-workspace switching within one grant, or direct database access.
- Changing DNS/custom domains unless required and separately recorded.
