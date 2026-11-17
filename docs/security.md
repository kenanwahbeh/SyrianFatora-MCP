# Security model and threat controls

## Secrets

- SyrianFatora API keys are user secrets and must remain server-side.
- OAuth signing/encryption keys are deployment secrets, not source files or plugin configuration.
- Access and refresh tokens must not reveal or encode the upstream API key.
- Never log Authorization headers, request bodies containing credentials, token values, or authorization codes.
- The authorization Worker passes the upstream API key only through Workers OAuth Provider's encrypted `props` mechanism. The MCP resource Worker must treat `props` as sensitive and must never log or return the key.

## OAuth requirements

- Authorization Code grant with PKCE `S256`, enforced by Workers OAuth Provider.
- Exact redirect URI validation; reject wildcards and open redirects.
- Validate the provider's browser-bound consent handle before completing authorization.
- Consent page must show client name, verified publisher domain when available, requested scopes, and redirect hostname.
- Audience and scope validation on every MCP request.
- Explicit token expiry, rotation/revocation strategy, and replay protections.
- Reject insecure HTTP origins except local development.

## Credential handling

- Collect the upstream key only on the first-party HTTPS authorization page.
- Validate credentials with the harmless read-only `GET /customers?per_page=1` endpoint.
- Validation requires `customers.read`; a 403 is not treated as an invalid key.
- The validation endpoint is fixed to `https://syrianfatora.com/api/public/v1/customers?per_page=1`; redirects are rejected.
- Never place credentials in URL parameters, analytics, logs, error traces, browser local storage, hidden form fields, or plugin configuration.
- Do not create a separate plaintext KV record for the API key.
- Provide a disconnect/revoke action that invalidates OAuth grants and deletes the stored upstream credential. This UX is not yet implemented.

## Operational safeguards

- Keep production unchanged until tests pass and a deployment is explicitly approved.
- Smoke tests must use `initialize`, `tools/list`, `/health`, and safe read-only calls only.
- Never test invoice creation, payment recording, deletion, or other write operations against a real workspace.
- Set request size limits, rate limits, no-store response headers for sensitive endpoints, and conservative CORS/Content Security Policy.
- Redact query strings and sensitive headers in observability.

## Incident response

If a key is exposed, revoke it in SyrianFatora, invalidate related OAuth grants, rotate affected signing/encryption material as appropriate, and inspect redacted audit events. Do not attempt to recover or print exposed secrets in logs.
