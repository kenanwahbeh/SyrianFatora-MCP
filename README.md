# SyrianFatora MCP

Secure remote Model Context Protocol (MCP) gateway for the SyrianFatora public API, hosted on Cloudflare Workers.

> **Production architecture:** The existing `syrianfatora-mcp` Worker remains the MCP resource server. The separate `syrianfatora-auth` Worker provides OAuth 2.1 authorization and connects to MCP through a Cloudflare Service Binding. Do not create a replacement MCP service.

## Product goal

Let a user connect their SyrianFatora workspace to ChatGPT or another compatible MCP client, then manage and read permitted billing resources through the existing MCP tool catalogue. Users must enter their SyrianFatora API key only on the first-party HTTPS authorization page; the key must never be pasted into chat, sent to the MCP client, or stored in a plugin package.

## Production status — 2026-11-20

**Status: Production OAuth infrastructure deployed; real Workspace-key verification remains NO-GO.**

- Auth Worker: https://syrianfatora-auth.kinan-api.workers.dev — version #6 `2f25855b-9299-47a1-88f6-65bf04f48da9`, deployment `34b83009-a63b-418b-ace6-a9365ad70cf3`.
- Existing MCP Worker: https://syrianfatora-mcp.kinan-api.workers.dev/mcp — version #8 `c83dc9c3-daf6-4f2e-961e-a792605c2ed7`, deployment `17e5289a-f676-49a6-b412-638f09b8776e`.
- OAuth issuer, authorization discovery, and protected-resource metadata are live; MCP health reports **51 tools**.
- Production probes verified health, OAuth discovery, protected-resource metadata, and invalid bearer-token rejection (401). These probes did **not** prove an authenticated MCP tool call using a real Workspace key.
- GitHub Actions: 41 Auth tests and 21 MCP tests pass on `main`; SQLite Durable Object concurrency and provider-directed 429 cooldown tests are covered.
- `npm audit --audit-level=high` reports zero vulnerabilities; Cloudflare Build triggers run audit, build, and tests.
- Both live production Build triggers deploy without `--force`; the flag is not configured in either automatic trigger.
- Production `workers.dev` endpoints remain enabled; public version-preview URLs are disabled.
- **Confirmed outstanding Preview artifact:** the production MCP `/oauth/client-metadata.json` endpoint still advertises `SyrianFatora Preview E2E Client`; cleanup is prepared in draft PR #52 and is not deployed.
- **NO-GO:** do not enter a real Workspace key until the six ordered gates in [the implementation plan](docs/implementation-plan.md) are closed. No real-key token issuance/refresh or authenticated production tool call has been verified.

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
6. Never configure `--force` in an automatic CI or Cloudflare Build production trigger. A one-time migration exception requires separate explicit approval, a captured live version/metadata baseline, a verified replacement artifact, and a documented rollback; remove the flag from the trigger immediately afterward.
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
