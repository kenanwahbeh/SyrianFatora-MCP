# SyrianFatora MCP

Secure remote Model Context Protocol (MCP) gateway for the SyrianFatora public API, hosted on Cloudflare Workers.

> **Production architecture:** The existing `syrianfatora-mcp` Worker remains the MCP resource server. The separate `syrianfatora-auth` Worker provides OAuth 2.1 authorization and connects to MCP through a Cloudflare Service Binding. Do not create a replacement MCP service.

## Product goal

Let a user connect their SyrianFatora workspace to ChatGPT or another compatible MCP client, then manage and read permitted billing resources through the existing MCP tool catalogue. Users must enter their SyrianFatora API key only on the first-party HTTPS authorization page; the key must never be pasted into chat, sent to the MCP client, or stored in a plugin package.

## Production status — 2026-11-19

**Status: Production migration deployed.**

- Auth Worker: https://syrianfatora-auth.kinan-api.workers.dev.
- Existing MCP Worker migrated in place: https://syrianfatora-mcp.kinan-api.workers.dev/mcp.
- OAuth issuer, authorization discovery, and protected-resource metadata are live.
- MCP health reports **51 tools**; the existing tool catalogue is preserved.
- Production smoke tests passed: Auth/MCP health, OAuth discovery, protected-resource metadata, and invalid bearer-token rejection (401).
- GitHub Actions: 40 Auth tests and 21 MCP tests pass. SQLite Durable Object concurrency and provider-429 cooldown tests pass.
- `npm audit --audit-level=high` reports zero vulnerabilities with the Cloudflare Build npm version (10.9.2); CI and Cloudflare Builds now enforce this gate.
- Production `workers.dev` endpoints remain enabled; public version-preview URLs are disabled.
- **Not yet verified:** completing OAuth token issuance and refresh using a real SyrianFatora workspace API key. Unit tests use synthetic keys; do not paste a real key into chat.

## Agreed production architecture

- **Resource Worker:** `syrianfatora-mcp` — keep this exact production service name and migrate code in place.
- **Authorization Worker:** `syrianfatora-auth` — separate OAuth 2.1 authorization server.
- **Internal connection:** Cloudflare Service Binding from `syrianfatora-mcp` to the `SyrianFatoraAuth` entrypoint exported by `syrianfatora-auth`.
- **OAuth:** Authorization Code + PKCE; scopes `mcp:read` and `mcp:write`.
- **Credential isolation:** provider-encrypted authorization props; never expose the upstream key to the client or create a plaintext credential record.
- **Compatibility:** preserve the existing 51 MCP tool names and their SyrianFatora API semantics.

## Production security and migration rules

1. Keep the existing `syrianfatora-mcp` Worker name and production identity.
2. Do not create a second MCP resource Worker as a replacement.
3. Keep the separate authorization Worker as the OAuth architecture dependency.
4. Keep the production issuer/resource URLs and KV/DO bindings aligned with the Cloudflare configuration.
5. Preserve a rollback path to the previous MCP script version before any future production overwrite.
6. Use `--force` only for an explicitly reviewed migration of the script-API-managed Worker, after capturing its current version and rollback reference. Never use it as a blind workaround.
7. Run dependency audit, build checks, and unit tests before deployment. Run only read-only smoke tests against production; never test create/update/delete operations against a real workspace.
8. Never put API keys, OAuth tokens, signing keys, KV secrets, or Cloudflare credentials in Git, issues, logs, or chat.
9. Record production resources, version IDs, deployment IDs, probes, and rollback references in [the production migration log](docs/production-migration.md).

## Project documents

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Implementation plan and acceptance criteria](docs/implementation-plan.md)
- [Production migration runbook and log](docs/production-migration.md)
- [Architecture decisions](docs/adr/)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Development

From each package directory:

- Audit dependencies: `npm audit --audit-level=high`.
- Build without deployment: `npm run build:check`.
- Run tests: `npm test`.

CI runs the same audit/build/test gates. The production smoke workflow checks health, OAuth discovery, resource metadata, tool count, and invalid-token rejection. It does not use a real workspace key or perform writes.

## License

This project is licensed under the [MIT License](LICENSE).
