# Security model and threat controls

## Secrets

- SyrianFatora API keys are user secrets and must remain server-side.
- OAuth signing/encryption keys are deployment secrets, not source files or plugin configuration.
- Access and refresh tokens must not reveal or encode the upstream API key.
- Never log Authorization headers, request bodies containing credentials, token values, or authorization codes.
- The authorization Worker passes the upstream API key only through Workers OAuth Provider's encrypted `props`; the MCP Worker treats `props` as sensitive and never logs or returns the key.

## OAuth requirements

- Authorization Code grant with PKCE `S256`.
- Exact redirect URI validation; reject wildcards and open redirects.
- Validate the provider's browser-bound consent handle before completing authorization.
- Consent page must show client name, publisher information when available, requested scopes, and redirect hostname.
- Validate audience and scopes on every MCP request.
- Use explicit token expiry, rotation/revocation strategy, and replay protections.
- Reject insecure HTTP origins except local development.

## Credential handling

- Collect the upstream key only on the first-party HTTPS authorization page.
- Validate credentials with the harmless read-only `GET /customers?per_page=1` endpoint.
- Validation requires `customers.read`; a 403 is not automatically an invalid key.
- The validation endpoint is fixed to `https://syrianfatora.com/api/public/v1/customers?per_page=1`; redirects are rejected.
- Never place credentials in URL parameters, analytics, logs, error traces, browser local storage, hidden form fields, or plugin configuration.
- Do not create a separate plaintext KV record for the API key.
- Implement a disconnect/revoke action that invalidates OAuth grants and deletes or invalidates the associated upstream credential. This UX is still outstanding.

## Production migration safeguards

- Keep the production resource Worker name exactly `syrianfatora-mcp`.
- Deploy the authorization Worker as a separate internal dependency; do not replace the MCP Worker with it.
- Capture the exact live MCP script, settings, bindings, versions, and deployment metadata before any overwrite.
- Never use `--force` solely to bypass a script API conflict without verifying the complete replacement artifact and rollback.
- Never use a real production workspace for write-operation smoke tests.
- Limit smoke tests to health, OAuth metadata/discovery, MCP initialize, tools/list, invalid-token rejection, and safe read-only upstream requests.
- Set request size limits, no-store response headers for sensitive endpoints, and conservative CORS/Content Security Policy.
- Redact sensitive headers, query strings, and authorization form bodies in observability.

## Testing exception

For the immediate production migration, the user has directed that automated tests be deferred. This is a documented risk exception, **not** a test pass or a waiver of security controls. Preserve the current known-good production version for rollback, use read-only probes only, and record all unverified behavior in the migration log. Restore automated and end-to-end testing before later feature changes.

## Incident response

If a key is exposed, revoke it in SyrianFatora, invalidate related OAuth grants, rotate affected signing/encryption material as appropriate, and inspect redacted audit events. Never recover or print exposed secrets from logs.
