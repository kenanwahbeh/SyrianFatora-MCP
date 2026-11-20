# SyrianFatora MCP Skills

Five independently loadable Agent Skills for the SyrianFatora MCP server. Each skill lives in its own directory and contains a `SKILL.md`.

## Skills

- `syrianfatora-core`: MCP tool inventory, authentication/scopes, workspace isolation, pagination, response formats, quotas, rate limits, HTTP errors, safe writes and source precedence.
- `syrianfatora-sales`: Customers, items/products/services, sales invoices and quotations; documented list filters, required/optional fields, enums and line-item rules.
- `syrianfatora-finance`: Payments, payment methods, credit notes and recurring invoices; payment side effects, void semantics and financial safeguards.
- `syrianfatora-expenses`: Suppliers, expenses, expense categories and exchange rates; filters, exact fields, enums and dependencies.
- `syrianfatora-webhooks`: All documented event names, delivery headers, HMAC-SHA256 verification, replay protection, retries and idempotent processing.

## Coverage map: `page.html`

| Developer reference section | Skill coverage |
|---|---|
| Overview, base URL, workspace isolation and conventions | `syrianfatora-core` |
| API key handling, Bearer authentication and resource scopes | `syrianfatora-core` |
| Live test warning and safe mutation policy | `syrianfatora-core` |
| Daily/monthly quotas, free-plan monthly metering, rate-limit headers and request logging | `syrianfatora-core` |
| HTTP errors, JSON response envelopes, fixed-precision decimal strings and live-console safety | `syrianfatora-core` |
| Customers, invoices, items and quotes | `syrianfatora-sales` |
| Credit notes, payments, payment methods and recurring invoices, including lifecycle restrictions | `syrianfatora-finance` |
| Expenses (including embedded payment history), suppliers, expense categories and exchange rates | `syrianfatora-expenses` |
| Webhook events, payload headers, signature verification and retries | `syrianfatora-webhooks` |
| FAQ: authentication, key issuance, quotas, webhook security and server-calculated totals | `syrianfatora-core` plus the relevant domain skill |

## Known API-surface limitations and discrepancies

- The MCP server exposes 51 tools across 12 resources. Customers and invoices have no update/delete tools; payment methods are read-only and non-paginated.
- Payment deletion is a soft void, not physical erasure. `payments_delete` accepts `void_reason` and forwards the exact documented REST body field `void_reason`.
- The live payment-method endpoint returned a seventh code, `transfer`, beyond the six codes in the `page.html` example. The `method` input remains a string and callers must use the current code from `payment_methods_list`.
- MCP list filters and create/update bodies are constrained to the exact fields, types, enums and documented bounds in `page.html`; unknown query/body fields are rejected before upstream calls.
- Webhook subscription management is not exposed through the MCP tools. The reference directs users to **التطبيق ← المطوّرون ← Webhooks**.
- Do not invent undocumented endpoints, filters, fields, event types or lifecycle actions.

## Documentation gap register

See [`COVERAGE.md`](COVERAGE.md) for the complete section-by-section audit and the items that were absent or incomplete in the previous Skills. [`LIVE-TEST-RESULTS.md`](LIVE-TEST-RESULTS.md) records the repeated live lifecycle tests, safe negative probes and the stale-production payment-void deployment gate. Dynamic dashboard figures supplied by the user are documented there as a snapshot only and are not hardcoded into Skills.

## Source of truth

- `../page.html` is the supplied Arabic developer reference and is authoritative for documented REST fields, filters, examples, response shapes, quota rules and webhook behavior.
- `../apps/mcp/src/handler.mjs` defines the current MCP tool inventory and REST mapping; `../apps/mcp/src/rest-contract.mjs` defines page-aligned input schemas.
- When the two disagree, surface the mismatch rather than guessing. The current MCP tool list must be checked at runtime.

These skills use the already-connected SyrianFatora MCP tools. They must never request, print, store or expose API keys, OAuth tokens or webhook secrets.
