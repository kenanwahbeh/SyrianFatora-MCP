# SyrianFatora credential separation and revocation review

**Reviewed:** 2026-11-20
**Status:** PR #54 is merged and its correction is deployed in Auth Worker v8. Provider-level token lifecycle behavior is covered by isolated tests. User-facing disconnect and credential-replacement management remain outstanding.

## Scope and evidence

This review covers the Auth Worker, MCP resource handler, the pinned `@cloudflare/workers-oauth-provider@1.2.4` behavior, and isolated Miniflare tests. It does not inspect production KV contents, real Workspace keys, access tokens, refresh tokens, or customer records.

## Credential separation

1. The API key is collected by the first-party HTTPS authorization form and validated with the read-only `GET /customers?per_page=1` request.
2. After consent, the key is stored in the OAuth grant's `props` as `upstreamApiKey`. The provider encrypts `props` at rest and returns decrypted properties only to the resource-server Worker after token validation.
3. The MCP handler uses the key only in the upstream `Authorization: Bearer` header. It redacts the key from response text and does not log it. Authorization-attempt tracking uses an HMAC fingerprint, not the raw key.
4. Every authorization gets a random grant subject. Each grant therefore has an independent credential; tests confirm that two grants remain isolated and that reauthorizing the same OAuth client with a different key creates a second independent grant.
5. The current read-only validation response does not provide a verified stable Workspace identifier. Therefore, the server cannot safely infer that two different keys belong to the same Workspace or automatically replace/revoke one based on the other.

## Refresh-token consent correction

The consent page presents `offline_access` as optional, but the previous global `refreshTokenTTL` setting caused the provider to issue a refresh token even when the user had not approved that scope. That did not match the consent UI.

PR #54 was merged on 2026-11-20. Auth Worker v8 includes a token-exchange callback that sets `refreshTokenTTL: 0` for an authorization-code exchange unless `offline_access` is present in the effective requested scopes. The isolated test verifies that a `mcp:read`-only grant receives no refresh token and expires with its access token. Existing tests verify that an `offline_access` grant can receive and rotate refresh tokens.

## Revocation semantics

The Auth discovery document advertises the RFC 7009 revocation endpoint at `/oauth/token` (the provider handles token and revocation requests on that endpoint).

- Revoking an **access token** deletes that token only. The grant and encrypted key remain until the grant's expiry. When `offline_access` is not granted, the grant expiry is aligned with the access-token lifetime.
- Revoking a **refresh token** revokes the entire grant and deletes its associated access/refresh tokens and encrypted `props`.
- The isolated tests verify both behaviors, including that a refresh token cannot be used after the grant is revoked.

## Credential replacement and disconnect limitations

- Reauthorization creates a separate grant; it does not automatically replace an earlier grant. This is deliberate while no stable Workspace identifier is available, because grouping grants by OAuth client alone could revoke one Workspace when another user connects through the same client.
- Before replacing a Workspace key, the previous grant's refresh token must be revoked. If no refresh token was issued, the grant expires with the access token; the Workspace key can also be invalidated at SyrianFatora.
- A user-facing disconnect or credential-replacement management page is not implemented.
- Whether ChatGPT calls the RFC 7009 revocation endpoint when a user disconnects is not verified. Do not assume that disconnecting a client automatically deletes the server-side grant.

## Remaining acceptance work

1. Decide whether a supported stable Workspace identifier exists before designing cross-grant replacement. Do not derive Workspace identity from the API key itself or from a guessed endpoint.
2. Define and document the supported user-facing disconnect/replacement flow, including the behavior when the client does not send a refresh-token revocation request.
3. Verify ChatGPT/client-side RFC 7009 revocation behavior without using a real Workspace key.
4. Keep further real Workspace-key tests blocked until the ordered release gates are formally closed.
