# ADR 0001: Use Workers OAuth Provider v1 with split Workers

- Status: Implemented and deployed
- Date: 2026-11-17

## Context

Cloudflare released Workers OAuth Provider v1 with a split API in October 2026. The authorization server issues tokens; a separate MCP resource server validates them through a Cloudflare Service Binding. The current SyrianFatora MCP Worker already exists in production and should be preserved as the resource-server role where practical.

## Decision

Use `@cloudflare/workers-oauth-provider` v1. Keep `syrianfatora-mcp` as the resource server and add a separate `syrianfatora-auth` Worker. Validate access tokens through a Service Binding rather than forwarding bearer tokens to a public introspection endpoint.

## Consequences

- OAuth authorization and credential onboarding are isolated from the MCP request handler.
- The existing MCP server requires a controlled migration to `OAuthResourceServer`.
- The auth Worker needs secure persistence for user-specific SyrianFatora credentials.
- Production bindings and deployments must wait until local tests and review pass.

## References

- https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/
- https://developers.cloudflare.com/agents/model-context-protocol/guides/securing-mcp-server/
- https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/
