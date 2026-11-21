---
name: syrianfatora-core
description: Use the SyrianFatora MCP server safely. Covers all registered resources, authentication scopes, pagination, response formats, quotas, errors and safe operation rules.
---

# SyrianFatora MCP — Core

Use this skill for every SyrianFatora task and combine it with the resource-specific skill.

## Connection and registered MCP surface

- Use the connected `syrianfatora-mcp` server and its tools. Prefer MCP over direct REST calls when an equivalent tool exists.
- The current server advertises **51 tools** across 12 resources:
  - `customers`: list, get, create.
  - `invoices`: list, get, create.
  - `items`: list, get, create, update, delete.
  - `quotes`: list, get, create, update, delete.
  - `credit_notes`: list, get, create, update, delete.
  - `payments`: list, get, create, delete.
  - `payment_methods`: list only.
  - `recurring_invoices`: list, get, create, update, delete.
  - `expenses`: list, get, create, update, delete.
  - `suppliers`: list, get, create, update, delete.
  - `expense_categories`: list, get, create, update, delete.
  - `exchange_rates`: list, get, create, update, delete.
- Tool names use `{resource}_{action}`; hyphens in REST resource names become underscores in MCP names.
- Check `tools/list` at runtime. Never infer an unsupported action from REST conventions.
- List accepts a `query` object only when the REST endpoint documents filters or pagination. `payment_methods_list` is the exception: it has no query argument and is not paginated.
- Get/update/delete require a string `id`. Create/update require a `body` object whose fields, types and required members follow the resource contract. `payments_delete` additionally requires the top-level MCP argument `void_reason`, which is sent in the REST JSON body as `{ "void_reason": "..." }`.

## Authentication and workspace boundaries

- REST base documented by the developer reference: `https://syrianfatora.com/api/public/v1`.
- The workspace owner enables API access and creates keys from **التطبيق ← المطوّرون**. A key is displayed only once (masked thereafter); it can be restricted to read-only permissions and revoked at any time. Never ask the user to paste a key into chat.
- Every API key is scoped to one workspace. A record ID belonging to another workspace is not accessible and returns 404.
- REST sends the key as `Authorization: Bearer <key>`. In ChatGPT, OAuth grants the upstream workspace credential to the MCP server; do not bypass this connection or ask the user to paste a key.
- There are two authorization layers: the MCP OAuth grant requires `mcp:read` for the server and additionally `mcp:write` for write tools; the upstream workspace API key must also carry the resource permission. REST reads require `{resource}.read`; REST create/update/delete require `{resource}.write`.
- Missing/invalid upstream credentials return 401; missing resource permission, missing MCP write scope or disabled API access returns 403.
- Never print, echo, log, persist or expose API keys, access/refresh tokens, OAuth codes, webhook secrets or authorization headers.

## Universal request and response rules

- Every REST response is JSON. Dates use `YYYY-MM-DD`; timestamps use ISO-8601.
- Request monetary values as numbers where the endpoint schema says `number`; response monetary/decimal values are returned as strings with fixed precision. Preserve the exact decimal string and currency code; do not silently convert or round.
- Resource list endpoints are paginated with `page >= 1`, `per_page = 1..100`, default 25, and return `data`, `links` and `meta`. `GET /payment-methods` is explicitly non-paginated and returns the available code/label list. Inspect pagination metadata before claiming a paginated result is complete.
- Single-record responses are wrapped in `data`.
- MCP list query values must be scalar strings, numbers or booleans. Do not send arrays, nested objects or null values as query parameters.
- Documented PUT update endpoints use full replacement request bodies, not PATCH semantics. Include every required field even when changing only one value; do not omit required fields from an update.
- The API calculates invoice, quote, credit-note and recurring-invoice totals, taxes and discounts. **Never submit calculated totals**; submit the documented line items, quantities, unit prices and applicable tax/discount fields. Include `exchange_rate` when the document currency differs from the workspace base currency.
- Preserve exact field names and enum values from `page.html`. Do not invent fields from common accounting practice.

## Quotas, rate limits and audit behavior

- The default daily workspace quota is 1,000 **successful API requests**; the workspace owner may request a higher limit. When the daily quota is reached, requests return HTTP 429 until the next day.
- Paid plans add a monthly quota measured over the billing cycle. On the free plan, monthly usage is recorded but does not block requests.
- Every successful request counts toward the applicable quota. All requests, including rejected 429 attempts, are recorded in workspace usage/audit logs; do not confuse audit-log volume with the successful-request quota counter.
- Every response carries `X-RateLimit-Limit` (daily limit) and `X-RateLimit-Remaining` (requests remaining today). A 429 response additionally carries `Retry-After` in seconds.
- On 429, stop and wait for `Retry-After`; do not retry rapidly or run concurrent retry loops.

## HTTP status interpretation

- 200 / 201: success.
- 401: missing or invalid API key.
- 403: insufficient resource scope or API access not enabled.
- 404: record not found or record outside the key's workspace.
- 409: conflict, locked record or record still in use.
- 422: validation failure; inspect safe `errors` details.
- 429: request quota/rate limit exceeded; honor `Retry-After`.
- Distinguish an empty successful list from a failed request. Never report 401/403/429/5xx as “no records”.
- Report the tool/resource, HTTP status and safe validation details. Do not expose unrelated customer data or secrets.

## Safe write and test policy

- Treat every create/update/delete/payment/void as a live business-data mutation.
- Perform a write only when the user clearly authorizes that specific action and its target, amount, date, currency and status are unambiguous.
- Never alter or delete an existing record as a test. Use a unique, unmistakably named test record only when explicitly authorized; capture its returned ID and clean up only that exact record.
- Verify each stage with the requested credential, not merely the credential that performed the write.
- Some resources have no delete tool; payment deletion is a soft void. Do not claim a lifecycle was fully reversible when it was not.
- If a test fails after creation, attempt cleanup of the exact created ID and report cleanup status. Never hide an orphaned test record.

## Source precedence and discrepancies

- `page.html` is the supplied developer reference for REST fields, filters, examples, response shapes, quotas and webhook behavior. It takes precedence over conflicting descriptions in these Skills for the REST contract.
- The developer page's live-test console executes real requests against the selected workspace. POST/PUT/DELETE can create, modify or void real records. Use a read-only key for exploration; never treat the console as a sandbox.
- `apps/mcp/src/handler.mjs` defines the registered MCP tool names and request mapping; `apps/mcp/src/rest-contract.mjs` defines the MCP input schemas mirrored from the documented REST contract.
- MCP schemas now reject undocumented query filters and request-body fields instead of passing arbitrary properties upstream. Date, enum and explicitly documented numeric constraints are validated before forwarding.
- If the MCP wrapper and `page.html` disagree, identify the exact mismatch, correct the wrapper to the page contract and add a regression test. Do not change the developer contract to fit the old wrapper.
- Webhook subscription management is not exposed by the current 51 MCP tools; use the application’s developer Webhooks settings as documented, not invented MCP calls.

## Standard workflow

1. Identify the resource and intended action.
2. Check that the exact MCP tool exists and determine its required scope.
3. Read the resource-specific skill and verify exact fields/enums in `page.html`.
4. Read narrowly and paginate when completeness matters.
5. Validate write inputs and dependencies before mutation.
6. For authorized test records, follow create → cross-key read → update → cross-key read → delete → cross-key absence verification.
7. Report passed, failed, skipped and unverified operations separately.

## Developer-reference details that govern daily use

- API keys are workspace-scoped and use `Authorization: Bearer <key>`. The REST permission convention is `{resource}.read` for GET and `{resource}.write` for POST/PUT/DELETE. A missing/invalid key returns 401; a valid key without the required permission, or a workspace with API access disabled, returns 403.
- The developer page says keys are created under **التطبيق ← المطوّرون**, shown once, optionally restricted to read-only access, and revocable.
- Query filters and request body fields are resource-specific. The MCP schema rejects extra fields; use the exact fields in the resource Skills rather than assuming a generic REST query/body can accept arbitrary properties.
- Paginated list responses contain `data`, `links`, and `meta`; a single-record response contains `data`. Use `page` and `per_page` as documented, with `per_page` from 1 to 100 and default 25.
- The developer page's test console is live, not a mock environment. Its key remains in the browser and is sent to the API; writes affect real workspace data.
- The page's FAQ confirms that invoice totals, taxes and discounts are calculated server-side. Send quantities, unit prices and, for foreign currency, `exchange_rate`; never send calculated totals.
