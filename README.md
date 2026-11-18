# SyrianFatora MCP

Secure remote Model Context Protocol (MCP) gateway for the SyrianFatora public API, hosted on Cloudflare Workers.

> **Project direction (2026-11-18):** Migrate the existing production MCP service in place. Keep the production Worker name `syrianfatora-mcp`, preserve its MCP endpoint identity and the existing 51 tools, and add OAuth 2.1 authorization. The MCP resource Worker remains the same service; a separate `syrianfatora-auth` Worker is required as the authorization server and connects to it through a Cloudflare Service Binding. Do not create a replacement MCP service.

## Product goal

Let a user connect their SyrianFatora workspace to ChatGPT or another compatible MCP client, then manage and read permitted billing resources through the existing MCP tool catalogue. Users must enter their SyrianFatora API key only on the first-party HTTPS authorization page; the key must never be pasted into chat, sent to the MCP client, or stored in a plugin package.

## Current status

- OAuth authorization and MCP resource-server source code are already merged into `main`.
- The MCP package preserves the existing 51 tools and enforces `mcp:read` / `mcp:write`.
- Both packages have previously built successfully and their unit tests passed in CI. **The user has instructed that automated tests be deferred for the immediate production migration; this is not a claim that end-to-end OAuth has been tested.**
- Local Worker-runtime integration and complete OAuth flow verification remain outstanding.
- Production currently remains on the previously inspected legacy `1.1.0` Worker baseline. The OAuth code is not yet active in production.
- The first production build attempt failed at deploy because the local config name `syrianfatora-mcp-oauth-preview` conflicted with the Cloudflare CI target `syrianfatora-mcp`; Cloudflare warned that the live script had been updated through the script API and aborted without applying the upload. Do not bypass this with an unreviewed `--force`.

## Agreed production architecture

- **Existing resource Worker:** `syrianfatora-mcp` — keep this exact production service name; migrate its code in place.
- **Authorization Worker:** `syrianfatora-auth` — separate OAuth 2.1 authorization server, required by the Workers OAuth Provider v1 split architecture.
- **Internal connection:** Cloudflare Service Binding from `syrianfatora-mcp` to the `SyrianFatoraAuth` entrypoint exported by `syrianfatora-auth`.
- **OAuth:** Authorization Code + PKCE; scopes `mcp:read` and `mcp:write`; `offline_access` only if the client lifecycle requires it.
- **Credential isolation:** provider-encrypted authorization `props`; never expose the upstream key to the client or create a plaintext credential record.
- **Compatibility:** preserve the existing 51 MCP tool names and their SyrianFatora API semantics.

## Production migration rules

1. Keep the existing `syrianfatora-mcp` Worker name and production identity.
2. Do not create a second MCP resource Worker as a replacement.
3. Create the separate authorization Worker only as the OAuth architecture dependency.
4. Determine and record the real production Worker URLs, account Worker subdomain, and KV namespace ID from Cloudflare. Never invent URLs or IDs and never deploy `.invalid` placeholders.
5. Configure the auth Worker, KV binding, MCP public resource URL, auth issuer URL, and Service Binding consistently.
6. Preserve a rollback path to the exact current production script/version before replacing the live MCP script.
7. Do not use `--force` to silence a script-API conflict until the live baseline is captured and the exact overwrite is understood.
8. Automated tests are deferred for this immediate migration at the user's direction. Record this as a testing exception, not a passing result. Do not run destructive/write smoke tests against a real SyrianFatora workspace.
9. Record every Cloudflare resource created or changed, deployment/version ID, probe result, and rollback reference in [the production migration log](docs/production-migration.md).
10. Never put API keys, OAuth tokens, signing keys, KV secrets, or Cloudflare credentials in Git, issues, logs, or chat.

## Project documents

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Implementation plan and acceptance criteria](docs/implementation-plan.md)
- [Production migration runbook and log](docs/production-migration.md)
- [Architecture decisions](docs/adr/)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Development

- MCP Worker: `cd apps/mcp && npm run build:check && npm test`.
- Authorization Worker: `cd apps/auth && npm run build:check && npm test`.
- Build checks use Cloudflare `cf build`; they do not deploy.
- Automated tests are currently deferred for the immediate production migration by explicit user direction. Restore the test gate before subsequent feature releases.
- Never use a production workspace for write-operation tests.

## License

This project is licensed under the [MIT License](LICENSE).
