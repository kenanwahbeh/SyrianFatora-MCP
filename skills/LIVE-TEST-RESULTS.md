# SyrianFatora MCP — Live and Local Test Results

**Updated:** 2026-11-21

## Current deployment status

The MCP source fix for payment voiding (`void_reason`) is included in production Worker v16. The pre-v16 live probe was rejected because that older deployment expected the legacy argument `reason`. No real payment was voided.

The v16 deployment itself is confirmed at 100% traffic. A post-v16 authenticated production smoke and a post-deployment live `void_reason` negative probe have **not** yet been recorded. Do not carry the pre-v16 result forward as the current production behavior.

## Historical pre-v16 live evidence

The following checks were performed against the older deployed MCP version before v16:

- `tools/list` returned 51 tools for KEY_1, KEY_2 and KEY_3.
- All 12 resource list tools returned HTTP 200 for the tested credentials.
- Existing-record reads succeeded for selected resources.
- `payment_methods_list` returned seven live codes: `cash`, `bank`, `shamcash`, `paymera`, `transfer`, `usdt`, and `other`. The example in `page.html` shows six and omits `transfer`; the wrapper correctly keeps `method` as a string.
- Eight reversible temporary-record lifecycles were completed: items, suppliers, expense categories, exchange rates, expenses, quotes, credit notes and recurring invoices. The test harness created uniquely marked records, checked cross-key reads/updates, deleted only its own records and verified absence.
- Safe invalid probes for customer, invoice and payment creation returned HTTP 422 without creating records.
- The pre-v16 payment-void probe was rejected at MCP schema validation because the deployed tool expected `reason`. No payment was targeted or voided.

These are historical test observations, not evidence that the same calls have been repeated against v16.

## Current source/build evidence

- MCP v16 Build: success.
- Dependency audit: passed.
- Cloudflare build check: passed.
- MCP tests: 53 passed, 0 failed.
- Deployment: v16 assigned 100% traffic.
- Cloudflare confirmed `AUTH_SERVER` and `RATE_LIMITER` bindings.

## Safe post-deployment smoke checklist

Run only with appropriate authorization and credentials:

1. MCP Worker `/health` returns HTTP 200 and reports `toolCount: 51`.
2. Protected-resource metadata advertises the expected Auth issuer.
3. A deliberately invalid bearer token is rejected with HTTP 401.
4. Auth discovery returns the expected issuer and endpoints.
5. An approved test credential completes Authorization Code + PKCE.
6. Authenticated MCP `initialize` and `tools/list` succeed.
7. If authorized, run a read-only `customers_list` with `per_page=1`.
8. If separately authorized, validate the `payments_delete` request mapping using a clearly nonexistent payment ID and `void_reason`; the request should reach REST and return not-found. Never use a real payment.

## Intentionally excluded from routine smoke tests

- Successful customer or invoice creation: no matching MCP delete operation exists.
- Successful payment creation: it affects invoice settlement and voiding leaves accounting history.
- Voiding an existing payment.
- Webhook subscription management: not exposed by the MCP tool catalogue.

## Script safeguards

- `scripts/production-oauth-smoke.mjs` performs a read-only OAuth Authorization Code + PKCE smoke.
- `scripts/live-mcp-key-test.mjs` and `scripts/live-mcp-skills-test.mjs` can perform live workspace operations; inspect the selected mode and cleanup behavior before running.
- Live write testing requires explicit approval for the designated test workspace, uniquely marked temporary records, verified cleanup and temporary grant revocation.
- Never print keys, access tokens, customer records or full API response bodies.
