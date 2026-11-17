# SyrianFatora MCP

Secure remote Model Context Protocol (MCP) gateway for the SyrianFatora public API, hosted on Cloudflare Workers.

> **Status:** Repository and project baseline created. The production Worker currently remains on its previously deployed `1.1.0` implementation. OAuth is not yet implemented or enabled. Do not treat this repository scaffold as a deployed release.

## Goals

- Expose SyrianFatora resources through a remote MCP endpoint.
- Keep each user's SyrianFatora API key server-side; never put it in a plugin package, URL, browser storage, or source control.
- Authenticate ChatGPT/MCP clients with a separate OAuth 2.1 authorization flow using Authorization Code + PKCE.
- Bind each OAuth grant to the correct SyrianFatora workspace and API key.
- Preserve existing MCP tools and their API semantics while adding authorization.
- Provide revocation, safe token lifecycle handling, audit-friendly errors, and automated tests.

## Current production baseline

- Cloudflare Worker service: `syrianfatora-mcp`
- Environment: `production`
- Previously confirmed deployment: `1.1.0`
- Existing API authentication: SyrianFatora Bearer token supplied to the MCP request
- Production bindings: none were present at the last inspection
- No verified custom domain; do not assume the endpoint until it is probed.

## Security rules

1. Never commit real API keys, OAuth client secrets, signing keys, access tokens, or refresh tokens.
2. Do not accept credentials in query strings.
3. Use HTTPS only; validate redirect URIs exactly and require PKCE `S256`.
4. Store user credentials and OAuth grants server-side using an appropriate encrypted/secure storage design.
5. Return only opaque or appropriately scoped OAuth tokens to the MCP client; never expose the upstream SyrianFatora key.
6. Do not run write operations against a real SyrianFatora workspace during smoke tests.
7. Do not alter production bindings, routes, DNS, or deployments until the implementation and tests are reviewed.

## Project documents

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Implementation plan and acceptance criteria](docs/implementation-plan.md)

## Development

Implementation tooling and runtime versions will be pinned when the first executable Worker source is added. Tests must run locally/CI before any production deployment.
