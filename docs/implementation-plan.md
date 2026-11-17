# Implementation plan and acceptance criteria

## Phase 0 — Baseline and source control

- [x] Create private GitHub repository.
- [x] Record current production baseline and security constraints.
- [ ] Retrieve and preserve the exact deployed Worker source in version control.
- [ ] Confirm the public MCP endpoint with direct HTTP probes.

## Phase 1 — OAuth design and compatibility

- [ ] Verify the current `workers-oauth-provider` package API and Cloudflare compatibility.
- [ ] Confirm ChatGPT remote MCP OAuth discovery requirements and supported registration behavior.
- [ ] Define issuer, authorization, token, revocation, and protected-resource metadata URLs.
- [ ] Define client registration policy and redirect URI allow-listing.
- [ ] Define scopes and the relationship between MCP tool permissions and SyrianFatora resource permissions.

**Acceptance:** written protocol contract; no production changes; security review of redirect, PKCE, CSRF, token audience, and tenant isolation.

## Phase 2 — Credential onboarding and storage

- [ ] Implement a first-party HTTPS authorization page.
- [ ] Validate a supplied SyrianFatora key using a read-only endpoint.
- [ ] Select and implement encrypted server-side credential storage.
- [ ] Bind each credential to the correct OAuth subject/grant.
- [ ] Implement disconnect, revocation, and credential deletion.

**Acceptance:** test keys only; no upstream key in client-visible responses, browser storage, logs, or package files; cross-tenant tests pass.

## Phase 3 — MCP authorization integration

- [ ] Protect the MCP endpoint with OAuth access tokens.
- [ ] Resolve the upstream key server-side for every request.
- [ ] Preserve the existing 51-tool catalogue and resource behavior.
- [ ] Map upstream 401/403/404/409/422/429 responses safely.
- [ ] Verify protocol discovery and token refresh/revocation behavior.

**Acceptance:** `initialize` and `tools/list` succeed with OAuth; unauthorized requests fail closed; safe read-only tools work with a test workspace.

## Phase 4 — Plugin package

- [ ] Update the existing SyrianFatora plugin, not create a duplicate.
- [ ] Add only the verified MCP endpoint and supported OAuth metadata/configuration.
- [ ] Remove any legacy static Bearer-token instructions that conflict with OAuth.
- [ ] Verify the connection flow from ChatGPT.

**Acceptance:** user can authorize without pasting the upstream API key into chat or plugin configuration.

## Phase 5 — Release and production rollout

- [ ] Run unit, integration, security, and MCP protocol tests.
- [ ] Review deployment diff and storage migrations.
- [ ] Obtain explicit approval for production bindings and deployment.
- [ ] Deploy, verify health and read-only MCP operations, and document rollback.

**Acceptance:** production deployment ID, health probe, OAuth discovery probe, and read-only MCP smoke test are recorded. No write operation is used for smoke testing.

## Open decisions

- Cloudflare storage choice and encryption model.
- OAuth client registration strategy supported by the current ChatGPT MCP client.
- Final verified MCP URL/custom domain.
- Whether refresh tokens are required by the supported client flow.
