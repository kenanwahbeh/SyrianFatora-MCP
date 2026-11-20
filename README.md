# SyrianFatora MCP

A remote [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) gateway for the SyrianFatora public API, hosted on Cloudflare Workers.

## What it does

Connects ChatGPT and compatible MCP clients to a SyrianFatora workspace. The user enters the workspace API key only on the first-party HTTPS authorization page. The key is retained in provider-encrypted OAuth grant properties and is never sent to the MCP client.

The MCP tool catalogue exposes read and write operations. OAuth scopes control access; production verification recorded so far is read-only.

## Architecture

The production deployment consists of two Workers:

- **`syrianfatora-mcp`** — the existing MCP resource server and public `/mcp` endpoint. It was migrated in place and retains its 51-tool catalogue.
- **`syrianfatora-auth`** — the OAuth 2.1 authorization server, connected to MCP through the internal `AUTH_SERVER` Cloudflare Service Binding.

OAuth uses Authorization Code with PKCE. The upstream API key is passed to the resource server only through provider-encrypted grant properties after token validation.

## Production status — 2026-11-20

**Status: deployed for controlled testing; further real-key testing is NO-GO.**

- Production health, OAuth discovery, protected-resource metadata, and invalid-token rejection (HTTP 401) passed.
- An operator-confirmed production Authorization Code + PKCE smoke succeeded with two real Workspace keys (`KEY_1` and `KEY_2`). Both sessions approved `mcp:read` and completed authenticated MCP `initialize`, `tools/list`, and read-only `customers_list` (`per_page=1`). No write operation was performed.
- Main-branch test suites: Auth 43 tests and MCP 24 tests. The Auth suite includes optional `offline_access`, refresh-token rotation, grant isolation, and revocation coverage. Dependency audits report zero high-severity vulnerabilities.
- Both automatic production Build triggers target `main` and deploy without `--force`.
- Production Preview metadata cleanup is deployed. The isolated Preview Worker remains available.

**Open release work**

- PR #54 is merged. The scope-aware refresh-token correction is deployed in Auth Worker v8.
- Provider-level refresh-token rotation and revocation semantics are covered by Auth tests. Actual ChatGPT/client disconnect behavior remains unverified.
- User-facing disconnect and credential-replacement management are not implemented. Reauthorization creates a separate grant; it does not automatically replace a previous key.
- The successful two-key smoke is historical read-only evidence. It does not authorize further real-key testing. Further tests remain **NO-GO** until gates 1–5 in the [implementation plan](docs/implementation-plan.md) are formally closed and reviewed.
- Production write-operation tests against real workspaces are prohibited.

The [production migration runbook](docs/production-migration.md) is the single source of truth for deployed versions, deployment IDs, probes, rollback references, and execution history.

## Documentation

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Credential lifecycle review](docs/credential-lifecycle-review.md)
- [Implementation status and release gates](docs/implementation-plan.md)
- [Production migration runbook and execution log](docs/production-migration.md)
- [Rate-limiter behavior audit](docs/rate-limiter-audit.md)
- [Architecture decision records](docs/adr/)
- [Contributing](CONTRIBUTING.md)
- [Security reporting policy](SECURITY.md)

## Development

The Auth and MCP packages are independent Cloudflare Workers. From each package directory:

```sh
npm install
npm audit --audit-level=high
npm run build:check
npm test
```

The automated production smoke workflow checks public health and OAuth/resource metadata, tool count, and invalid-token rejection. It does **not** use a real Workspace key. The separate operator-run `npm run smoke:oauth` script performs the authenticated Authorization Code + PKCE flow and read-only MCP calls; see [the MCP package guide](apps/mcp/README.md).

## License

[MIT](LICENSE)
