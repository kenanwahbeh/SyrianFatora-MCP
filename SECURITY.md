# Security Policy

## Project status

SyrianFatora MCP is under active development. The repository does not currently represent a completed, generally available OAuth release. See the README and implementation plan for the current status.

## Reporting a vulnerability

Please do not report security vulnerabilities in public GitHub Issues or pull requests.

Use GitHub's private vulnerability reporting feature for this repository if it is enabled. Otherwise, contact the repository maintainer privately through the maintainer's GitHub profile:

https://github.com/kenanwahbeh

Include a description of the affected component, the potential impact, reproduction steps, and any relevant version or commit. Do not include live API keys, access tokens, refresh tokens, private customer data, or other credentials in the report.

## Scope

Security-sensitive areas include:

- OAuth authorization, redirects, PKCE, token validation, and revocation.
- SyrianFatora API-key collection, validation, storage, and handling.
- MCP tool authorization, scope enforcement, and tenant isolation.
- Cloudflare Worker configuration, bindings, and service-to-service communication.
- Logging, error handling, and exposure of secrets or customer data.

## Coordinated disclosure

Please allow the maintainer a reasonable opportunity to investigate and prepare a fix before publicly disclosing a vulnerability. No response-time or remediation-time SLA is currently offered.
