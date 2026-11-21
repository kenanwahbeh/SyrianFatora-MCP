# AGENT.md — Repository operating instructions

These instructions apply to all automated coding agents and contributors working in this repository. The specialized GitHub agent profile at `.github/agents/syrianfatora-guardian.agent.md` must follow these rules and the same source-of-truth policy.

## 1. Source of truth

Use the checked-in implementation on the target branch as the source of truth for what the software actually does.

When documenting behavior, verify it against these files first:

| Concern | Implementation source |
| --- | --- |
| MCP tool names and resource/action inventory | `apps/mcp/src/handler.mjs` |
| REST request schemas and resource contracts | `apps/mcp/src/rest-contract.mjs` |
| MCP request lifecycle, scopes, upstream calls and response handling | `apps/mcp/src/handler.mjs`, `apps/mcp/src/index.mjs` |
| MCP argument and origin validation | `apps/mcp/src/input-validation.mjs`, `apps/mcp/src/origin-validation.mjs` |
| OAuth provider, consent, grant properties and token lifecycle | `apps/auth/src/index.mjs`, `apps/auth/src/security.mjs` |
| Authorization abuse protection and provider cooldown | `apps/auth/src/rate-limit-client.mjs`, `apps/auth/src/rate-limit.mjs`, `apps/mcp/src/rate-limit-client.mjs` |
| Worker names, bindings, URLs and compatibility settings | `apps/*/cloudflare.config.ts` |
| Commands and dependencies | `apps/*/package.json` |
| Automated test behavior | `apps/*/test/`, `.github/workflows/` |
| Operator-run live test behavior | `scripts/`, `apps/mcp/README.md` |

The supplied SyrianFatora REST reference snapshot is the authority for documented upstream fields and semantics. The current source is the authority for the MCP surface actually implemented. If they disagree, document the discrepancy; do not silently change the upstream contract to fit the wrapper.

Runtime `tools/list` is authoritative for the deployed MCP tool catalogue. Do not infer an MCP tool merely because a REST endpoint exists.

## 2. Architecture invariants

- Keep the production MCP Worker name exactly `syrianfatora-mcp` and preserve its public resource endpoint unless the operator explicitly approves a migration.
- The separate `syrianfatora-auth` Worker is the OAuth authorization server, not another MCP resource endpoint.
- MCP calls Auth through the `AUTH_SERVER` Service Binding and the `SyrianFatoraAuth` entrypoint.
- The MCP Worker's `RATE_LIMITER` binding uses the Auth Worker's `CredentialRateLimiter` Durable Object.
- OAuth uses Authorization Code with PKCE. `mcp:read` is required; write tools additionally require `mcp:write`. `offline_access` is optional.
- The upstream Workspace API key is collected only on the first-party HTTPS authorization page and stored in provider-encrypted OAuth grant properties. Never expose it to the MCP client.
- Each authorization grant is isolated. The random grant subject is not a stable Workspace identifier. Reauthorization must not implicitly replace another grant.
- Do not create a duplicate public MCP Worker, expose the upstream key, or add undocumented REST fields/endpoints.

## 3. MCP contract rules

- Preserve the source-defined resource/action registry and its exact tool names unless a reviewed change intentionally alters the public API.
- Keep request schemas strict. Unknown properties must not be forwarded to the upstream API.
- Do not submit server-calculated invoice, quote, tax, discount or recurring-document totals.
- Keep payment voiding aligned with the REST body field `void_reason`; do not reintroduce a `reason` alias.
- `payment_methods_list` is read-only and non-paginated.
- Customers and invoices currently expose list/get/create only.
- List query values are scalar strings, numbers or booleans; pagination and per-resource filters must match the contract.
- Monetary input types and response precision must follow the upstream contract; do not silently round or convert currencies.

## 4. Security and privacy

- Never commit API keys, OAuth access/refresh tokens, authorization codes, webhook secrets, Cloudflare tokens, or signing secrets.
- Never print secrets in tool output, test diagnostics, logs, fixtures, screenshots or chat.
- Do not log request bodies or Authorization headers that could contain credentials.
- Keep credential storage inside provider-encrypted grant properties; do not add a plaintext KV copy.
- Never store raw API keys, IP addresses or grant subjects in Durable Object limiter state. Use the existing HMAC-based approach.
- Do not add local daily/monthly/per-grant MCP request quotas. SyrianFatora owns Workspace API quota.
- Authorization-attempt protection is separate from MCP usage quota. Provider-directed 429 cooldown is stored only when a valid upstream `Retry-After` is supplied. Do not invent a fallback wait or automatically retry.
- Preserve request size limits, upstream timeout, manual redirect handling, response redaction and no-store behavior.

## 5. Change and testing workflow

1. Inspect the current branch, working tree, relevant source, tests, package scripts and workflow configuration before editing.
2. Make the smallest coherent change. Do not rewrite unrelated modules or regenerate lockfiles unless dependencies actually change.
3. Add or update regression tests for changed behavior.
4. Run the affected package's dependency audit, build check and test suite using the scripts in its `package.json`.
5. For cross-worker changes, test both packages and inspect both Cloudflare configurations and bindings.
6. Report exact commands and results. Distinguish unit tests, mocked integration tests, live read-only probes and live write tests.
7. Update every affected README, document, skill and this file when behavior or operational policy changes. Do not copy transient deployment IDs into generic architecture docs.

## 6. Production safety and release

- Never deploy, promote, change traffic, modify DNS, or change production bindings/secrets as an incidental part of a code task.
- Never use `--force` as a routine deployment command or in an automatic Build trigger. The one-time approved migration workaround is historical, not a standing policy.
- The MCP version-upload command is `cf workers versions create --prebuilt --mode production`; uploading a version does not promote it.
- Production promotion requires separate explicit operator approval and verification of the candidate version, bindings and rollback target.
- Never run irreversible live operations as tests. Do not create customers, invoices or payments merely to test. Never void an existing payment.
- Live write testing requires explicit operator approval for a designated test workspace, uniquely marked temporary records, and a proven cleanup/revocation path.
- After deployment, report deployment confirmation separately from functional smoke-test confirmation. A successful upload/build is not proof that OAuth or MCP tools work end to end.

## 7. Documentation discipline

- Root `README.md` is the project overview and links to detailed documents.
- `apps/mcp/README.md` and `apps/auth/README.md` describe each Worker as implemented.
- `docs/production-migration.md` is the only canonical location for live version IDs, deployment IDs, build IDs, rollback references and production probe evidence.
- `docs/architecture.md`, `docs/security.md`, `docs/implementation-plan.md`, and `docs/rate-limiter-audit.md` must agree with source and current operational state.
- Skills under `skills/*/SKILL.md` describe the upstream business contract and the actual MCP tool boundary. Keep the two distinct.
- Mark historical facts as historical. Never leave stale values labeled current.
- If a behavior is unverified, say so explicitly; do not turn assumptions into facts.
