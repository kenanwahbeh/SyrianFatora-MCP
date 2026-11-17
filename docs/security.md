# Security model and threat controls

## Secrets

- SyrianFatora API keys are user secrets and must remain server-side.
- OAuth signing/encryption keys are deployment secrets, not source files or plugin configuration.
- Access and refresh tokens must not reveal or encode the upstream API key.
- Never log Authorization headers, request bodies containing credentials, token values, or authorization codes.

## OAuth requirements

- Authorization Code grant with PKCE `S256`.
- Exact redirect URI validation; reject wildcards and open redirects.
- Validate `state`; bind authorization requests to the browser session.
- Short-lived, single-use authorization codes.
- Audience and scope validation on every MCP request.
- Explicit token expiry, rotation/revocation strategy, and replay protections.
- Reject insecure HTTP origins except local development.

## Credential handling

- Collect the upstream key only on a first-party HTTPS authorization page.
- Validate credentials with a harmless read-only API call before storing.
- Encrypt credentials at rest using a reviewed design and managed secret/key facilities where appropriate.
- Never place credentials in URL parameters, analytics, logs, error traces, or browser local storage.
- Provide a disconnect/revoke action that invalidates OAuth grants and deletes the stored upstream credential.

## Operational safeguards

- Keep production unchanged until tests pass and a deployment is explicitly approved.
- Smoke tests must use `initialize`, `tools/list`, `/health`, and safe read-only calls only.
- Never test invoice creation, payment recording, deletion, or other write operations against a real workspace.
- Set request size limits, rate limits, no-store response headers for sensitive endpoints, and conservative CORS/Content Security Policy.
- Redact query strings and sensitive headers in observability.

## Incident response

If a key is exposed, revoke it in SyrianFatora, invalidate related OAuth grants, rotate affected signing/encryption material as appropriate, and inspect redacted audit events. Do not attempt to recover or print exposed secrets in logs.
