# SyrianFatora MCP

Secure remote Model Context Protocol (MCP) gateway for the SyrianFatora public API, hosted on Cloudflare Workers.

> **Status:** The OAuth authorization Worker and OAuth-protected MCP resource-server implementation are merged into `main`. The implementation has unit tests, but Worker bundle/runtime validation and end-to-end OAuth verification are still outstanding. The existing production Worker remains on its previously verified `1.1.0` baseline; the OAuth Workers are preview-only source and are not deployed or enabled in production.

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
- Last verified deployment: `1.1.0`
- Existing API authentication: SyrianFatora Bearer token supplied to the MCP request
- Production bindings: none were present at the last inspection
- No verified custom domain; do not assume the endpoint until it is probed.

The OAuth authorization and resource-server packages under `apps/auth` and `apps/mcp` are source-only preview implementations. A change in GitHub does not deploy or modify the Cloudflare production Worker.

## Security rules

1. Never commit real API keys, OAuth client secrets, signing keys, access tokens, or refresh tokens.
2. Do not accept credentials in query strings.
3. Use HTTPS only; validate redirect URIs exactly and require PKCE `S256`.
4. Store user credentials and OAuth grants server-side using an appropriate encrypted/secure storage design.
5. Return only opaque or appropriately scoped OAuth tokens to the MCP client; never expose the upstream SyrianFatora key.
6. Do not run write operations against a real SyrianFatora workspace during smoke tests.
7. Do not alter production bindings, routes, DNS, or deployments until the implementation and tests are reviewed and production changes are explicitly approved.

## Project documents

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Implementation plan and acceptance criteria](docs/implementation-plan.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Development

- Keep changes focused and document behavior, security assumptions, and testing.
- Run the tests relevant to the changed component before opening a pull request.
- Authorization-worker unit tests: `cd apps/auth && npm test`.
- MCP resource-worker unit tests: `cd apps/mcp && npm test`.
- The Wrangler dry-run bundle check is being added through a separate CI pull request; it does not deploy the Worker.
- OAuth provider integration tests, Service Binding validation, and a complete end-to-end authorization flow remain outstanding.
- Never use a production workspace for write-operation tests.

## License

This project is licensed under the [MIT License](LICENSE).
