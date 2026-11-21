# SyrianFatora MCP Skills

Five independently loadable Agent Skills describe the documented SyrianFatora REST contract and the actual MCP tool boundary.

## Skills

- `syrianfatora-core`: MCP tool inventory, authentication/scopes, workspace isolation, pagination, response formats, upstream quotas, errors and safe operation.
- `syrianfatora-sales`: Customers, items/products/services, sales invoices and quotations.
- `syrianfatora-finance`: Payments, payment methods, credit notes and recurring invoices.
- `syrianfatora-expenses`: Suppliers, expenses, expense categories and exchange rates.
- `syrianfatora-webhooks`: Documented webhook events, delivery headers, HMAC-SHA256 verification, replay protection, retries and idempotent processing.

## MCP surface boundary

The source registry in `../apps/mcp/src/handler.mjs` currently defines 51 tools across 12 resources. The live `tools/list` response is authoritative. Customers and invoices have list/get/create only; payment methods are read-only and non-paginated. Webhook subscription management is not exposed through MCP.

Payment voiding is a soft void, not physical erasure. `payments_delete` requires `void_reason` and sends that exact REST body field.

## Source precedence

- The user-supplied `page.html` REST reference is authoritative for documented upstream endpoints, fields, filters, enums, response semantics, quotas and webhook behavior.
- `apps/mcp/src/handler.mjs` is authoritative for the MCP operations actually exposed and their REST mapping.
- `apps/mcp/src/rest-contract.mjs` is authoritative for the current wrapper's request schemas.
- If the upstream reference and implementation differ, record the discrepancy. Do not silently rewrite one to match the other.
- Check the live MCP `tools/list` before claiming a tool is available in a deployed environment.

## Coverage and test records

- [REST contract coverage audit](COVERAGE.md)
- [Live and local test results](LIVE-TEST-RESULTS.md)

The coverage audit is a comparison of the developer reference and the wrapper; it is not proof that every endpoint is available in the current production deployment. Live-test records must distinguish historical probes from current deployed behavior.

These skills use the connected SyrianFatora MCP tools. Never request, print, store or expose API keys, OAuth tokens or webhook secrets.
