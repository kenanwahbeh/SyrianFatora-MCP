# Architecture

## Decision: preserve the existing MCP Worker and split OAuth authorization

**Decision date:** 2026-11-18  
**Status:** Accepted for implementation.

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

The MCP resource URL must be the exact currently configured public URL, including `/mcp`. The issuer must be the exact public HTTPS origin of the auth Worker, without a trailing slash. Discover both from Cloudflare account/Worker configuration and verify with live read-only probes before committing production values. Do not infer the Worker subdomain or invent a custom domain.

The resource URL, issuer, OAuth `resources` value, MCP `resourceMetadata.resource`, and client-discovered endpoint must match exactly.

## Identity and tenancy

Every authorization grant maps to one SyrianFatora credential/workspace. Use a unique server-side grant subject. Do not treat the random OAuth subject as proof of a human identity or workspace ID. Enforce grant isolation on every request. Never trust a client-supplied workspace label as identity.

## Upstream quota and abuse controls

Both the authorization server and resource server consume the same upstream SyrianFatora quota. The approval POST must be rate-limited before credential validation, and each MCP upstream proxy call must be rate-limited before fetch. A keyed HMAC fingerprint of the API credential is the stable quota identity across multiple OAuth grants; raw keys must never be used as limiter keys or logged.

Use Cloudflare Rate Limiting bindings for approximate edge/IP and per-grant burst controls, but do not mistake their per-location eventually consistent counters for a strict global workspace quota. A Durable Object keyed by the credential fingerprint must coordinate the strict shared per-credential budget and cooldown state across concurrent requests and locations. It must atomically check/charge before forwarding. Apply the same budget to authorization validation and MCP proxy calls. Honor upstream 429 / Retry-After and open a per-credential cooldown; never blindly retry.

Thresholds must be finite and configurable, based on SyrianFatora's actual quota and legitimate expected usage. No provider quota is currently confirmed in this repository; do not invent one. The production rollout is blocked until thresholds, bindings, fail-closed behavior, and read-only verification are complete. If the limiter is unavailable, do not call the upstream API.

The current source does not yet implement these controls; this is an explicit implementation gap, not a claim of protection.

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
