# Security Policy

## Project security status

SyrianFatora MCP is deployed for controlled testing, but it is not yet a completed general-availability OAuth release. The production deployment has passed health and metadata checks, and an operator-confirmed read-only OAuth smoke succeeded with two real Workspace keys. Refresh-token consent behavior, lifecycle/revocation verification, and user-facing disconnect/replacement remain open. See the [README](README.md), [security model](docs/security.md), and [implementation gates](docs/implementation-plan.md) for the current state.

## Reporting a vulnerability

Do not report security vulnerabilities in public GitHub Issues or pull requests.

Use GitHub's private vulnerability reporting feature for this repository if it is enabled. Otherwise, contact the maintainer privately through the maintainer's GitHub profile:

https://github.com/kenanwahbeh

Include the affected component, potential impact, reproduction steps, and relevant version or commit. Do not include live API keys, access tokens, refresh tokens, private customer data, or other credentials.

## Scope

Security-sensitive areas include:

- OAuth authorization, redirects, PKCE, token validation, refresh, and revocation.
- SyrianFatora API-key collection, validation, encrypted storage, and handling.
- MCP tool authorization, scope enforcement, and grant isolation.
- Cloudflare Worker configuration, bindings, and service-to-service communication.
- Logging, error handling, and exposure of secrets or customer data.

## Coordinated disclosure

Please allow the maintainer a reasonable opportunity to investigate and prepare a fix before public disclosure. No response-time or remediation-time SLA is currently offered.
