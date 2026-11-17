# ADR 0002: Store upstream API credentials in encrypted OAuth grant props

- Status: Accepted for the first implementation
- Date: 2026-11-17

## Context

Each OAuth grant must be associated with exactly one SyrianFatora workspace API key. The key must never be returned to ChatGPT, placed in URLs, or stored as plaintext in a general-purpose KV record.

Cloudflare Workers OAuth Provider v1 documents that the `props` supplied to `completeAuthorization()` are encrypted and returned to the resource server with validated requests. The provider itself uses a KV namespace for OAuth grants and tokens.

## Decision

Pass the validated SyrianFatora API key as `props.upstreamApiKey` when completing authorization. Keep the KV namespace dedicated to provider-managed OAuth state. Do not create a second custom plaintext KV record for the key.

The authorization Worker validates the key first with the read-only `GET /customers?per_page=1` endpoint. This requires the upstream `customers.read` permission. A random UUID is used as the grant subject; it is a grant identifier, not a claim about the user's legal identity or the workspace ID.

## Consequences

- The MCP resource Worker can use the key from trusted provider props after token validation.
- The MCP Worker must treat props as secrets and must never log, echo, or persist the key separately.
- Revocation must invalidate the OAuth grant so the encrypted props are no longer available to authorized MCP requests.
- Credential replacement and disconnect UX remain future work.
- This decision depends on the provider's documented encrypted-props behavior and must be revisited if the provider contract changes.
