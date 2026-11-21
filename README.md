# SyrianFatora MCP

OAuth-protected remote [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) integration for the SyrianFatora public REST API, hosted on Cloudflare Workers.

## What this repository contains

This repository contains two independently built Cloudflare Workers:

- **`syrianfatora-mcp`** — the MCP resource server. It publishes the SyrianFatora tool catalogue, validates OAuth access tokens through an internal Service Binding, enforces MCP scopes, validates request arguments, and proxies requests to the upstream REST API.
- **`syrianfatora-auth`** — the OAuth 2.1 authorization server. It handles client registration/discovery, Authorization Code with PKCE, consent, credential validation, token lifecycle, and the Durable Object used for authorization-attempt protection.

The Auth Worker is an internal authorization dependency, not a second public MCP endpoint.

## Runtime architecture

```text
MCP client
   │ OAuth Authorization Code + PKCE
   ▼
syrianfatora-auth
   │ encrypted OAuth grant properties
   ▼  AUTH_SERVER Service Binding / token validation
syrianfatora-mcp
   │ server-side Bearer credential
   ▼
https://syrianfatora.com/api/public/v1
```

The Workspace API key is entered only on the first-party HTTPS authorization page. Auth validates it using a read-only customer-list request and stores it in the OAuth provider's encrypted grant properties. The key is not sent to the MCP client and must never be logged or committed.

OAuth scopes:

- `mcp:read` is required for MCP access and read tools.
- `mcp:write` is additionally required for create, update, and delete tools.
- `offline_access` is optional and controls refresh-token issuance.

Each authorization creates an isolated grant. The random grant subject is not a verified person or Workspace identifier. Reauthorization does not automatically replace or revoke another grant.

## MCP surface

The MCP catalogue is generated in `apps/mcp/src/handler.mjs` from the resource/action registry. The current source defines **51 tools across 12 resources**:

| Resource | Registered actions |
| --- | --- |
| `customers` | list, get, create |
| `invoices` | list, get, create |
| `items` | list, get, create, update, delete |
| `quotes` | list, get, create, update, delete |
| `credit-notes` | list, get, create, update, delete |
| `payments` | list, get, create, delete |
| `payment-methods` | list |
| `recurring-invoices` | list, get, create, update, delete |
| `expenses` | list, get, create, update, delete |
| `suppliers` | list, get, create, update, delete |
| `expense-categories` | list, get, create, update, delete |
| `exchange-rates` | list, get, create, update, delete |

The runtime `tools/list` response is authoritative. Do not infer tools from REST endpoints: for example, customers and invoices have no update/delete tools, and payment methods are read-only and non-paginated.

Request schemas and REST body contracts are defined in `apps/mcp/src/rest-contract.mjs`; generic MCP argument validation is in `apps/mcp/src/input-validation.mjs`. Payment voiding uses the exact REST field `void_reason`.

## Repository layout

- `apps/mcp/` — MCP resource Worker, request handler, REST contracts, Cloudflare configuration and tests.
- `apps/auth/` — OAuth authorization Worker, security helpers, rate-limit client/Durable Object and tests.
- `skills/` — five domain Agent Skills plus coverage and live-test records.
- `docs/` — architecture, security, implementation status, credential lifecycle, rate-limiter audit, ADRs and production runbook.
- `scripts/` — operator-run OAuth and live MCP test scripts.
- `.github/workflows/` — independent Auth/MCP test workflows and production smoke automation.

See [AGENT.md](AGENT.md) before changing the codebase.

## Production deployment

Production service identities:

- MCP endpoint: [https://syrianfatora-mcp.kinan-api.workers.dev/mcp](https://syrianfatora-mcp.kinan-api.workers.dev/mcp)
- Auth issuer: [https://syrianfatora-auth.kinan-api.workers.dev](https://syrianfatora-auth.kinan-api.workers.dev)

**MCP production deployment verified on 2026-11-21:**

- Worker: `syrianfatora-mcp`
- Version: `v16`
- Version ID: `bfe9cbad-f08c-4f67-9fc9-23136fe9f2ae`
- Deployment ID: `9a33a35e-d8ab-473b-8e33-51a13b346a8c`
- Traffic: 100% assigned to v16
- Source commit: `7cfa1e84d7e825aa08bf4b8f5b10c5b18b7c106a`
- Build: `72694a25-7494-4775-8f2c-9a2b069f78e5`
- Build result: success; dependency audit, build check and 53 MCP tests passed.
- Deployment bindings observed: `AUTH_SERVER` → `syrianfatora-auth#SyrianFatoraAuth`; `RATE_LIMITER` → `CredentialRateLimiter` in `syrianfatora-auth`.

The deployment itself is verified. A post-v16 authenticated production MCP functional smoke has **not** yet been recorded; do not describe the current version as fully smoke-tested or release-ready until that check is completed.

The MCP Build trigger's permanent deploy command is version-upload-only:

```sh
npx cf workers versions create --prebuilt --mode production
```

This uploads a version without changing traffic. Promotion is a separate, explicit release action. A one-time migration used `cf deploy --prebuilt --mode production --force` after explicit operator approval to resolve the pre-existing Script API ownership conflict; this is not the normal deployment command and must not be restored to an automatic trigger. See [the production runbook](docs/production-migration.md).

## Development and tests

Requirements: Node.js 20 or later.

Run each Worker independently from its own directory:

```sh
cd apps/mcp
npm ci
npm audit --audit-level=high
npm run build:check
npm test
```

```sh
cd apps/auth
npm ci
npm audit --audit-level=high
npm run build:check
npm test
```

The latest MCP production Build completed 53 MCP tests successfully. Auth has a separate test suite and build workflow; do not infer that an MCP-only Build executed the Auth suite.

Operator-run live scripts are separate from unit tests and must only be used under the safeguards documented in [apps/mcp/README.md](apps/mcp/README.md) and [skills/LIVE-TEST-RESULTS.md](skills/LIVE-TEST-RESULTS.md). Never run live write tests without explicit approval for the designated test workspace and a verified cleanup path.

## Documentation

- [Agent instructions](AGENT.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Credential lifecycle review](docs/credential-lifecycle-review.md)
- [Implementation status and release gates](docs/implementation-plan.md)
- [Production migration runbook](docs/production-migration.md)
- [Rate-limiter audit](docs/rate-limiter-audit.md)
- [REST-to-MCP coverage audit](skills/COVERAGE.md)
- [Skills index](skills/README.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

## License

[MIT](LICENSE)
