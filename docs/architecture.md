# Architecture

## Current decision

**Status:** Implemented and deployed, with product lifecycle work still open.

Keep the existing production MCP resource Worker `syrianfatora-mcp` and migrate it in place. Its public endpoint and 51-tool catalogue remain the production interface. Run a separate authorization server, `syrianfatora-auth`, as required by the split Workers OAuth Provider architecture.

The MCP Worker validates access tokens through a Cloudflare Service Binding to the Auth Worker's `SyrianFatoraAuth` entrypoint. Token validation does not require a public network call.

## Production components

- **MCP resource Worker — `syrianfatora-mcp`:** public MCP endpoint, existing tool catalogue, SyrianFatora API adapter, scope enforcement, and access-token validation.
- **OAuth authorization Worker — `syrianfatora-auth`:** authorization page, consent, OAuth discovery and client registration, authorization-code exchange, and provider-managed token/grant state.
- **Service Binding — `AUTH_SERVER`:** connects the resource Worker to the Auth Worker's `SyrianFatoraAuth` entrypoint.
- **OAuth provider:** `@cloudflare/workers-oauth-provider@1.2.4`.
- **KV:** provider-managed OAuth authorization and token state.
- **Credential storage:** the SyrianFatora API key is supplied only through provider-encrypted grant `props`; no separate plaintext KV credential record is created.

## Authorization and request flow

1. The MCP client discovers protected-resource metadata from the existing MCP endpoint.
2. Metadata identifies the production authorization issuer.
3. The user is redirected to the first-party HTTPS authorization page.
4. Auth validates the client, redirect URI, resource, state, and PKCE challenge.
5. The user enters the SyrianFatora API key on that page and approves the requested scopes.
6. Auth validates the key using read-only `GET /customers?per_page=1`.
7. Workers OAuth Provider completes Authorization Code + PKCE and issues a token for the MCP resource.
8. The MCP Worker validates the token through the internal Service Binding and receives trusted grant properties.
9. The MCP Worker calls the SyrianFatora API with the upstream Bearer key held server-side.
10. The upstream key is never returned to the MCP client.

## Production resource identity

- MCP resource: `https://syrianfatora-mcp.kinan-api.workers.dev/mcp`
- OAuth issuer: `https://syrianfatora-auth.kinan-api.workers.dev`

These values must agree across Worker configuration, OAuth resource metadata, issuer metadata, and client discovery. Do not substitute guessed subdomains or introduce DNS/custom-domain changes without a separately reviewed requirement.

## Grant isolation and identity limits

Each authorization grant contains one validated upstream API credential. The random OAuth subject identifies that grant only; it is not a verified human identity or a stable SyrianFatora Workspace ID. The current validation response does not provide a stable Workspace identifier. Reauthorization therefore creates an independent grant and does not automatically replace or revoke an earlier grant.

Enforce grant isolation on every MCP request. Never treat a client-supplied workspace label, random subject, or credential fingerprint as a verified Workspace identity.

## Scope enforcement and compatibility

- `mcp:read` is required for MCP access and read operations.
- `mcp:write` is additionally required for create, update, and delete operations.
- Preserve the existing 51 tool names, schemas, upstream paths, and request semantics unless a separately reviewed change explicitly authorizes a behavior change.

The successful production smoke with `KEY_1` and `KEY_2` verified read-only authenticated MCP calls. It did not test write operations.

## Quota and abuse controls

SyrianFatora is the authority for Workspace API quota. Do not create local per-key, per-grant, daily, or monthly MCP request quotas.

Auth retains narrow protections against repeated authorization submissions:
- IP-based authorization-attempt protection.
- Credential-fingerprint protection for repeated API-key validation attempts.

The MCP Worker does not count normal requests locally. It may store a credential-scoped cooldown only after SyrianFatora returns HTTP 429 with a valid `Retry-After` header. Use the provider-specified duration, do not invent a fallback, and do not automatically retry. The HMAC fingerprint is used only for privacy-preserving authorization protection and provider-directed cooldown state; it is not a Workspace ID or usage counter.

## Token lifecycle and product limitations

Auth Worker v8 includes the scope-aware refresh-token correction merged in PR #54: refresh tokens are issued only when `offline_access` is in the effective requested scope. Auth tests cover this behavior, refresh-token rotation, grant isolation, and the distinction between access-token revocation and full grant revocation.

Provider-level lifecycle behavior is implemented and source-tested. Actual ChatGPT/client disconnect behavior is not verified. User-facing disconnect and credential-replacement management are not implemented. These remaining product requirements are tracked in the [credential lifecycle review](credential-lifecycle-review.md) and [implementation plan](implementation-plan.md).

## Rollback principle

Before any production Worker overwrite, capture the deployed script, metadata, bindings, version ID, and deployment ID. A source archive alone is not a complete rollback artifact. Keep Auth and MCP deployments separately identifiable. The production runbook records the current rollback targets and the Preview-cleanup caveat.

## Non-goals

- Replacing or renaming the existing MCP Worker.
- Creating a second public MCP resource endpoint.
- Rewriting the existing tool catalogue as part of the OAuth migration.
- Adding webhooks, direct database access, or multi-workspace switching within one grant.
- Changing DNS or custom domains without a separately approved requirement.
