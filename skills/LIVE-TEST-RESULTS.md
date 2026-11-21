# SyrianFatora MCP — Live and Local Test Results

**Overall live status: BLOCKED_STALE_PRODUCTION.** All reversible lifecycle tests and safe negative API probes passed. The deployed Production MCP still exposes the old payment-void argument `reason`; the updated local branch uses the documented `void_reason`. No payment was voided.

- Test date: 2026-11-21 (Damascus local date; VPS log timestamps are UTC).
- MCP server tested live: `syrianfatora-mcp.kinan-api.workers.dev`.
- Registered tools: 51; `tools/list` passed for KEY_1, KEY_2 and KEY_3.
- Credentials were read locally from `.env`. No API key, OAuth token or secret value was printed or included in this report.
- The updated MCP code was tested locally; it has not been deployed to Production.

## Live read coverage

For KEY_1 and KEY_2:

- All 12 resource list tools returned HTTP 200.
- Existing-record get calls returned HTTP 200 for customers, invoices, items, payments, expense categories and exchange rates.
- Other resource lists were empty at the time of the check.
- `payment_methods_list` returned HTTP 200 and seven live methods: `cash`, `bank`, `shamcash`, `paymera`, `transfer`, `usdt`, `other`.

### Payment-method sample discrepancy

The live endpoint returned `transfer`, which is absent from the six-code example response in `page.html`. The page defines the payment request field as a string code obtained from GET `/payment-methods`; therefore the MCP schema keeps `method` as a string and requires callers to use the current returned code. The page file was not changed.

## Repeated reversible cross-key lifecycle tests

Each resource followed the full sequence:

1. KEY_3 created a uniquely marked temporary record.
2. KEY_1 read the created record.
3. KEY_3 updated that record.
4. KEY_2 read the update and verified a changed field.
5. KEY_3 deleted the exact test record.
6. KEY_1 and KEY_2 both confirmed HTTP 404 after deletion.

| Resource | Create | KEY_1 read | Update | KEY_2 read updated | Delete | KEY_1 + KEY_2 absence |
|---|---:|---:|---:|---:|---:|---:|
| Items | 201 | 200 | 200 | 200 | 200 | 404 / 404 |
| Suppliers | 201 | 200 | 200 | 200 | 200 | 404 / 404 |
| Expense categories | 201 | 200 | 200 | 200 | completed | 404 / 404 |
| Exchange rates | 201 | 200 | 200 | 200 | 200 | 404 / 404 |
| Expenses | 201 | 200 | 200 | 200 | 200 | 404 / 404 |
| Quotes | 201 | 200 | 200 | 200 | 200 | 404 / 404 |
| Credit notes | 201 | 200 | 200 | 200 | 200 | 404 / 404 |
| Recurring invoices | 201 | 200 | 200 | 200 | 204 | 404 / 404 |

All eight lifecycles passed. Recurring invoice deletion correctly returned HTTP 204 with no response body.

## Safe negative probes for previously untested write endpoints

These requests were deliberately invalid and were expected to be rejected without creating data:

| Tool | Probe | Result |
|---|---|---:|
| `customers_create` | Empty required name | HTTP 422 |
| `invoices_create` | Nonexistent customer ID | HTTP 422 |
| `payments_create` | Nonexistent invoice ID | HTTP 422 |

All three probes passed. No customer, invoice or payment was created.

## Payment-void deployment gate

- Local branch unit tests verify that `payments_delete` requires `void_reason` and sends DELETE JSON body `{ "void_reason": "..." }`.
- The live test against the currently deployed Production MCP was rejected before reaching REST with: `arguments.reason is required`.
- This proves Production still runs the old MCP schema. No real payment was targeted or voided.
- The fixed code must be deployed before the live `void_reason`/404 probe can pass against the actual REST endpoint.

## Intentionally not performed

- Successful customer creation: no customer delete tool exists, so a test record would remain.
- Successful invoice creation: no invoice delete tool exists, so a test invoice would remain.
- Successful payment creation: it immediately affects invoice settlement; deletion is only a soft void and leaves accounting history.
- Payment void on a real payment: irreversible accounting-history effect.
- Payment-method writes: read-only resource.
- Webhook subscription management: not exposed by the 51 MCP tools.

These are documented skips, not failed tests.

## Cleanup

- All eight temporary test records were deleted.
- Both read credentials confirmed HTTP 404 after deletion.
- The temporary expense category was deleted and independently verified absent.
- No pre-existing customer, invoice, payment or business record was modified.

## Local branch verification

- MCP unit suite: 53 passed, 0 failed (after final local edits).
- Build check: passed (Cloudflare Vite production bundle).
- All five Skill frontmatter blocks validated.
- All 51 registered MCP tool names are represented in the five Skills.
- Contract inventory tests compare all 12 resources' query/body fields and required fields against the reviewed `page.html` contract.
- No production deployment, Cloudflare binding/secret/DNS change was performed.

## Remaining deployment follow-up

After this PR is merged and the updated Worker is deliberately deployed, rerun the live payment-void negative probe with a nonexistent numeric ID and `void_reason`. It should reach REST and return 404. Do not use a real payment to test a soft void.
