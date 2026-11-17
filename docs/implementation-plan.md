# Implementation plan and acceptance criteria

## Phase 0 — Baseline and source control

- [x] Create GitHub repository.
- [x] Record current production baseline and security constraints.
- [x] Archive the exact deployed Worker v1.1.0 source as `src/worker-v1.1.0.mjs`.
- [ ] Confirm the public MCP endpoint with direct HTTP probes.

## Phase 1 — OAuth architecture and compatibility

- [x] Verify Cloudflare's current Workers OAuth Provider v1 split architecture.
- [x] Select separate authorization and resource-server roles.
- [x] Pin Workers OAuth Provider v1 dependency to 1.2.4.
- [x] Confirm the current authorization and consent helper APIs against Cloudflare documentation.
- [x] Confirm Client ID Metadata Documents and legacy Dynamic Client Registration support.
- [x] Define OAuth scopes: `mcp:read`, `mcp:write`, and optional `offline_access`.
- [x] Define `ISSUER`, `MCP_SERVER_URL`, and `OAUTH_KV` runtime configuration contract.
- [x] Choose encrypted OAuth provider `props` for the per-grant upstream API key; do not create a separate plaintext credential store.
- [ ] Confirm the exact public MCP endpoint and authorization origin.
- [ ] Verify ChatGPT remote MCP discovery and client registration behavior end-to-end.

**Acceptance:** protocol contract documented; no production changes; security review of redirect, PKCE, CSRF, token audience, encrypted props, and tenant isolation.

## Phase 2 — Authorization Worker

- [x] Create `apps/auth` Worker package and pin provider dependency.
- [x] Implement authorization endpoint using `OAuthAuthorizationServer`.
- [x] Add first-party consent and API-key entry page using provider consent handles.
- [x] Validate the API key using a harmless `GET /customers?per_page=1` request.
- [x] Require `customers.read` for the validation probe.
- [x] Pass the upstream API key only in provider-encrypted authorization `props`.
- [x] Add safe response headers and avoid logging credentials or request bodies.
- [x] Add unit tests for HTML escaping, bounded form parsing, upstream key validation, and consent-scope validation.
- [ ] Add local integration tests against the pinned OAuth Provider package.
- [ ] Implement credential replacement and disconnect/revocation UX.
- [ ] Configure the production KV namespace and Worker secrets/bindings only after review.

**Acceptance:** test keys only; no upstream key in client-visible responses, browser storage, logs, or package files; OAuth provider tests pass; no production deployment.

## Phase 3 — MCP Resource Worker

- [x] Add `OAuthResourceServer` v1 wrapper in `apps/mcp`.
- [x] Validate tokens through the auth Worker Service Binding contract.
- [x] Read the upstream key only from validated encrypted grant props.
- [x] Preserve all 51 existing MCP tool definitions and request mappings.
- [x] Enforce `mcp:read` for MCP access and `mcp:write` for create/update/delete tool calls.
- [x] Keep the payment-void reason requirement and bound request size.
- [x] Add tests for tool catalogue parity, scope enforcement, key isolation/redaction, and request validation.
- [x] Build both Worker packages with the Cloudflare `cf` CLI and Vite plugin v2; local `cf build` succeeds for both packages.
- [ ] Verify Worker runtime behavior and provider integration tests.
- [ ] Verify protected-resource metadata, invalid/expired tokens, and Service Binding token validation end-to-end.
- [ ] Verify safe read-only upstream calls using a dedicated test workspace.

**Acceptance:** `initialize` and `tools/list` succeed with OAuth; unauthorized requests fail closed; writes require `mcp:write`; safe read-only tools work with a test workspace.

## Phase 4 — Plugin package

- [ ] Update the existing SyrianFatora plugin, not create a duplicate.
- [ ] Add only the verified MCP endpoint and supported OAuth metadata/configuration.
- [ ] Remove legacy static Bearer-token instructions.
- [ ] Verify the authorization flow from ChatGPT.

**Acceptance:** user can authorize without pasting the upstream API key into chat or plugin configuration.

## Phase 5 — Release and production rollout

- [ ] Run unit, integration, security, and MCP protocol tests.
- [ ] Review deployment diff, bindings, storage migrations, and rollback.
- [ ] Obtain explicit approval for production bindings and deployments.
- [ ] Deploy auth Worker and migrate the MCP Worker in a controlled sequence.
- [ ] Verify health, OAuth discovery, and read-only MCP smoke tests.

**Acceptance:** production deployment IDs, health probe, OAuth discovery probe, and read-only MCP smoke test are recorded. No write operation is used for smoke testing.

## Open decisions

- Verified production URL for the MCP resource and authorization issuer.
- Whether ChatGPT needs refresh tokens for this connector lifecycle.
- Exact mapping between per-resource SyrianFatora API permissions and MCP scopes.
- Whether to retain optional Dynamic Client Registration for older MCP clients.
- Production rollout sequence and rollback procedure.
