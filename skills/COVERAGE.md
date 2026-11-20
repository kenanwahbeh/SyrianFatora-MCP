# SyrianFatora Skills — `page.html` authority and coverage audit

## Source precedence

`page.html` is authoritative for the documented REST API contract: endpoint paths, HTTP methods, scopes, request fields, filters, enums, examples, response envelopes, quotas, errors and webhook behavior. If an existing Skill or MCP wrapper differs, this audit records the mismatch; do not rewrite the developer contract to fit the wrapper. `apps/mcp/src/handler.mjs` remains authoritative only for what the current MCP server actually exposes and how its arguments are mapped.

## Section-by-section coverage

| `page.html` section | Skill | Coverage / additions |
|---|---|---|
| Overview | core | Base URL, workspace isolation, date/timestamp formats, decimal-string response precision, server-calculated totals, pagination |
| Authentication | core | Bearer key, resource scopes, 401/403, key creation path, one-time display, read-only restriction and revocation |
| Live test console | core | Explicit warning that requests are real and writes mutate workspace data; use read-only key for exploration |
| Daily/monthly quotas | core | 1,000 default successful requests/day, optional increase, monthly paid-plan quota, free-plan monthly metering without blocking, response headers and 429 logging distinction |
| Webhooks | webhooks | UI subscription path, eight documented events, headers, raw-body HMAC-SHA256, 300-second replay window, up to five retries, fast 2xx acknowledgement and async processing |
| Errors | core | 200/201, 401, 403, 404, 409, 422 and 429 semantics |
| Customers | sales | List/get/create, search and exact create fields |
| Invoices | sales | List/get/create, status, customer filter, line-item fields, calculated totals and public verification path |
| Items | sales | List/get/create/update/delete, filters, product/service enum, unit price, tax and code uniqueness |
| Quotes | sales | List/get/create/update/delete, fields and line items; locked sent/accepted update and converted delete both return 409 |
| Credit notes | finance | List/get/create/update/delete; sent/shared notes-only update, delete conflict 409, applied-balance reduction 422 |
| Payments | finance | List/get/create/soft-void; settlement side effect, USDT verification_pending 202, overpayment 422, REST `void_reason` |
| Payment methods | finance | Non-paginated GET, no query parameters, and documented accepted codes |
| Recurring invoices | finance | List/get/create/update/delete, schedule fields, generation metadata and 204 deletion response |
| Expenses | expenses | List/get/create/update/delete, stored vs effective status, embedded payment history and balances |
| Suppliers | expenses | List/get/create/update/delete and 409 dependency rule |
| Expense categories | expenses | List/get/create/update/delete, filters, color/icon enums and 409 dependency rule |
| Exchange rates | expenses | List/get/create/update/delete, currency filter, rate/date validation and one rate per currency/day (duplicate date 422) |
| FAQ | core + domain Skills | Authentication, key management, quotas, 401/403, webhook signature safety and server-calculated totals |

## Items that were missing or incomplete in the previous Skills

1. **Free-plan monthly quota behavior:** monthly usage is recorded but does not block requests while the application is on the free plan.
2. **Quota vs audit distinction:** successful requests count against the quota; all requests including 429 attempts are logged in usage/audit. These are not the same counter.
3. **Live-test console safety:** POST/PUT/DELETE are real workspace mutations, not sandbox operations; the page explicitly recommends a read-only key for exploration.
4. **Key lifecycle:** the workspace owner enables API access and creates keys under `التطبيق ← المطوّرون`; keys are shown once, can be restricted to read-only and revoked.
5. **Response precision:** decimal monetary values are returned as fixed-precision strings, not generic JSON numbers.
6. **Quote state restrictions:** locked sent/accepted quotes cannot be updated; converted quotes cannot be deleted; both return 409.
7. **Credit-note state restrictions:** after sent/shared, only `notes` can change; deletion returns 409; reducing funding for an applied balance returns 422.
8. **Expense payment detail:** expense responses embed payment history, `effective_status`, `has_receipt`, `total_paid` and `remaining_balance`. The reference does not define a separate expense-payment endpoint.
9. **Invoice/quote/recurring response metadata:** public invoice verification path, quote lock/conversion lifecycle fields, and recurring generation metadata were not called out.
10. **Exchange-rate uniqueness:** one rate per currency per day; duplicate effective dates are rejected with 422.
11. **Exact payment-void REST payload:** the reference requires `void_reason`; the previous MCP wrapper accepted/sent `reason`. Corrected in the current change and covered by a request-mapping regression test.
12. **Resource-specific MCP input schemas:** the previous handler accepted arbitrary query filters and arbitrary body fields. Added strict per-resource schemas for all 12 resources, including required/optional fields, primitive types, enums, date validation, nested line-item fields and documented numeric bounds. Unknown fields are rejected before any upstream request.
13. **Non-paginated payment methods:** the endpoint explicitly documents no pagination or query parameters. The MCP tool no longer advertises a query object for this endpoint.
14. **Live payment-method inventory differs from the sample:** on 2026-11-21, the live GET returned seven codes (cash, bank, shamcash, paymera, transfer, usdt, other), while the page.html sample response shows six and omits transfer. The REST field is documented as a string code sourced from GET /payment-methods, so the MCP schema keeps method as a string and does not freeze the sample into an enum. This runtime observation is recorded without editing page.html.

## Resolved REST/MCP discrepancy — payment void

- `page.html`: DELETE `/payments/{id}` JSON body requires `void_reason`.
- MCP tool argument: `void_reason`; outgoing JSON body: `{ "void_reason": "..." }`.
- The legacy `reason` argument is rejected. No undocumented 3–500 character length constraint is added.
- Regression coverage verifies the outgoing DELETE method, path and exact JSON body without contacting the live API.

## Dynamic dashboard information (not part of the static API contract)

The user-provided usage panel showed a time-specific snapshot: 265/1,000 daily requests used, 735 remaining, 27%; monthly plan Free with 289 requests shown against an unlimited/non-enforcing monthly limit; 1 error that day; and a 14-day history view. These values are mutable dashboard data, not static API documentation. They are intentionally not hardcoded into operational Skills. The stable rule from `page.html` is that free-plan monthly usage is recorded but does not block requests.

## MCP surface boundary

The current MCP server advertises 51 tools across 12 resources. It does not expose customer/invoice update or delete, payment-method mutation, expense-payment endpoints, or webhook subscription management. Webhook subscriptions are managed in **التطبيق ← المطوّرون ← Webhooks**. Do not infer REST capabilities are automatically available as MCP tools.

## Validation

- Existing five Skills updated in place; no new domain skill introduced.
- Confirm all 51 handler tool names are represented in at least one Skill.
- Validate every per-resource schema against the endpoint fields and filters in `page.html`.
- Validate each Skill frontmatter and run the MCP unit suite and build check.
- Live negative probes and reversible lifecycle tests are recorded separately in `LIVE-TEST-RESULTS.md`; irreversible test writes remain intentionally excluded.
- No production deployment, Cloudflare settings, DNS, secrets or credential changes are part of this change.
