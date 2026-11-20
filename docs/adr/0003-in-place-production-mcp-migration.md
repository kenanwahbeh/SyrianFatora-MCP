# ADR 0003: In-place production MCP migration

- **Status:** Accepted and implemented
- **Date:** 2026-11-18
- **Decision owners:** Project maintainer and assistant implementation session

## Context

The production Cloudflare Worker `syrianfatora-mcp` already serves the public MCP integration. The repository now contains an OAuth 2.1 authorization Worker and an OAuth-protected MCP resource Worker. The initial Cloudflare Build failed at deploy because the MCP config still named a preview Worker while Cloudflare CI targeted the existing production Worker. Cloudflare also reported that the live script was last updated through the script API and refused to overwrite it without force.

## Decision

1. Keep the existing production MCP Worker name exactly `syrianfatora-mcp`.
2. Migrate that Worker in place; do not create a replacement MCP resource Worker or duplicate public MCP endpoint.
3. Deploy a separate authorization Worker named `syrianfatora-auth`, because Workers OAuth Provider v1 separates authorization and resource-server responsibilities.
4. Connect the existing MCP Worker to the auth Worker through a Cloudflare Service Binding named `AUTH_SERVER`, targeting entrypoint `SyrianFatoraAuth`.
5. Preserve all 51 existing MCP tools and their API semantics.
6. Use Authorization Code + PKCE, provider-managed KV state, and provider-encrypted grant properties for the SyrianFatora API key.
7. Defer automated tests for the immediate production migration at the maintainer's direction. This is a recorded risk exception, not a passing test result.
8. Never bypass the script API conflict with an unreviewed `--force`. Capture the live script and deployment metadata and retain a rollback path first.

## Consequences

- There will be two Cloudflare Workers, but only one public MCP resource service. The auth Worker is a supporting OAuth endpoint.
- Production issuer/resource URLs and KV namespace ID were discovered and verified before production configuration was committed.
- The auth Worker was deployed and verified before the existing MCP Worker was switched to OAuth.
- The legacy production script remains archived as the pre-migration baseline; immediate rollback targets are recorded per Worker in the production migration log.
- A later operator-confirmed production read-only OAuth Authorization Code + PKCE smoke completed successfully with two real Workspace keys (`KEY_1` and `KEY_2`), including authenticated MCP initialization, tool discovery, and `customers_list`. Refresh/revocation lifecycle and user-facing disconnect/replacement behavior remain separate outstanding items.

## Follow-up implementation

The initial migration's test deferral was temporary. Subsequent work added the Auth SQLite Durable Object concurrency tests and the full Auth/MCP CI gates. On `main`, Auth passes 41/41 tests and MCP passes 24/24 tests. Production health, OAuth discovery, protected-resource metadata, tool count, and invalid-token rejection were verified. The later operator-confirmed two-key production smoke completed OAuth and authenticated read-only MCP calls; refresh/revocation lifecycle and disconnect/replacement UX remain outstanding.
