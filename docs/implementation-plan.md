# Implementation plan and acceptance criteria

## Phase 0 — Baseline and source control

- [x] Create private GitHub repository.
- [x] Record current production baseline and security constraints.
- [x] Archive the exact deployed Worker v1.1.0 source as `src/worker-v1.1.0.mjs`.
- [ ] Confirm the public MCP endpoint with direct HTTP probes.

## Phase 1 — OAuth architecture and compatibility

- [x] Verify Cloudflare's current Workers OAuth Provider v1 split architecture.
- [x] Select separate authorization and resource-server roles.
- [ ] Confirm ChatGPT remote MCP OAuth discovery and client registration behavior against current requirements.
- [ ] Define issuer, authorization, token, revocation, protected-resource metadata, and service-binding names.
- [ ] Define scopes and the relationship between MCP tool permissions and SyrianFatora resource permissions.
- [ ] Verify the provider's encrypted `props` contract and persistence boundaries.

**Acceptance:** written protocol contract; no production changes; security review of redirect, PKCE, CSRF, token audience, storage, and tenant isolation.

## Phase 2 — Authorization Worker

- [ ] Add `apps/auth` Worker using `OAuthAuthorizationServer` v1.
- [ ] Implement first-party HTTPS authorization, key-entry, and consent pages.
- [ ] Validate supplied SyrianFatora keys with a harmless read-only endpoint.
- [ ] Implement secure credential persistence and grant association.
- [ ] Implement disconnect, revocation, and credential deletion.
- [ ] Add tests for redirect URI validation, state, PKCE S256, issuer, audience, and tenant isolation.

**Acceptance:** test keys only; no upstream key in client-visible responses, browser storage, logs, or package files; cross-tenant tests pass.

## Phase 3 — MCP Resource Worker

- [ ] Add `OAuthResourceServer` v1 to `apps/mcp` and preserve the existing tool catalogue.
- [ ] Validate tokens through an auth Worker Service Binding.
- [ ] Resolve the upstream key from trusted grant properties/server-side storage.
- [ ] Map upstream 401/403/404/409/422/429 responses safely.
- [ ] Verify protocol initialization, tool listing, token expiry, and revocation.

**Acceptance:** `initialize` and `tools/list` succeed with OAuth; unauthorized requests fail closed; safe read-only tools work with a test workspace.

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

- Durable credential storage and encryption model.
- ChatGPT client metadata discovery vs dynamic client registration compatibility.
- Final verified MCP and authorization URLs/custom domains.
- Exact OAuth scopes and write-operation step-up strategy.
- Whether refresh tokens are required by the supported client flow.
