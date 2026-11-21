---
name: syrianfatora-finance
description: Work with SyrianFatora payments, payment methods, credit notes and recurring invoice schedules using the connected MCP tools and exact documented accounting rules.
---

# SyrianFatora — Payments and financial documents

Apply `syrianfatora-core`. Financial writes can affect receivables and accounting history; verify the target document, amount, currency, date and status before acting.

## Registered tools

- Payments: `payments_list`, `payments_get`, `payments_create`, `payments_delete`.
- Payment methods: `payment_methods_list` only.
- Credit notes: `credit_notes_list`, `credit_notes_get`, `credit_notes_create`, `credit_notes_update`, `credit_notes_delete`.
- Recurring invoices: `recurring_invoices_list`, `recurring_invoices_get`, `recurring_invoices_create`, `recurring_invoices_update`, `recurring_invoices_delete`.

## Payments

- List filter: `invoice_id`; pagination uses `per_page` and `page`.
- Create body:
  - Required: `invoice_id`, `amount` (>= 0.01), `currency`, `paid_at` (YYYY-MM-DD), `method`.
  - Optional: `exchange_rate` (required when currency differs from the workspace base currency), `note`.
- Always call `payment_methods_list` before choosing a method. The `method` request field is a string containing a code returned by that endpoint; use the exact current `code`, never the display label. The illustrative response in `page.html` lists `cash`, `bank`, `shamcash`, `paymera`, `usdt` and `other`; do not hardcode this sample as a closed enum. A live check on 2026-11-21 also returned `transfer`, which is not present in the page's sample response.
- Important behavior: a payment recorded through the API settles the invoice immediately regardless of method. For a USDT invoice, the API instead starts verification and may return HTTP 202 with `status: "verification_pending"`. Overpayment is rejected with 422.
- Search the invoice and payments before recording anything. Never create a duplicate payment or use a payment call merely to simulate a test unless the user explicitly accepts the accounting impact.
- `payments_delete` is a **soft void**, not physical deletion. The record remains in history with `is_voided` and `void_reason`; it emits the documented `payment.voided` event.
- **Authoritative REST contract (`page.html`):** DELETE `/payments/{id}` requires a JSON body with the required string field `void_reason` (example: `{ "void_reason": "Recorded by mistake" }`). The REST response returns the voided payment.
- **MCP/REST alignment:** `payments_delete` requires the MCP argument `void_reason` and serializes the DELETE body with the exact REST key `void_reason`. The old `reason` alias is rejected; no undocumented 3–500 character limit is imposed.
- Do not invent a length constraint for `void_reason`; `page.html` only documents it as a required string.
- Never state that a payment was erased. Confirm `is_voided` and `void_reason` in the returned record.
- Never claim an invoice is paid in full unless the API confirms its status/balance.

## Payment methods

- `payment_methods_list` is read-only and has no pagination or get/create/update/delete operations.
- It returns the currently accepted `code` and human-readable `label` pairs without pagination. The request schema deliberately keeps `method` as a string because the endpoint response is the live source of accepted codes; do not invent or translate them.

## Credit notes

- List filters: `status`, `customer_id`, `currency`; pagination uses `per_page` and `page`.
- Create/update body fields:
  - Required: `customer_id`, `currency`, `amount` (>= 0.01), `issued_at` (YYYY-MM-DD).
  - Optional: `reason`, `notes`.
- Do not assume an `invoice_id` field exists for credit-note creation; use only the documented fields.
- Credit-note deletion changes live accounting data. Create/update/delete only with explicit authorization and the exact returned record ID.
- Do not submit a calculated total.

## Recurring invoices

- List filters: `status` (`active` or `paused`), `customer_id`, `frequency`; pagination uses `per_page` and `page`.
- Create/update body:
  - Required: `customer_id`, `currency`, `language` (`ar`, `en`, `tr`), `frequency` (`weekly`, `monthly`, `yearly`), `interval_count` (1–365), `start_date`, `next_run_date`, `discount_type` (`fixed` or `percent`), `tax_mode` (`invoice` or `line`), `items` (at least one).
  - Optional: `exchange_rate` (for foreign currency), `end_date` (on/after start date), `is_active`, `discount`, `tax_rate`, `notes`.
  - Each `items[]` line: optional `item_id`; required `title`, `qty` (> 0), `unit_price` (>= 0), `discount_type`; optional `discount_value`, `tax_rate`.
- Set `is_active: false` for an explicitly authorized inert test schedule. Do not assume a schedule has generated/sent an invoice until a corresponding invoice record confirms it.
- Never submit calculated totals. Delete only the exact authorized schedule. The developer reference documents HTTP 204 with no response body for successful deletion.

## Financial interpretation

- Separate recorded payments, invoice balances, credit notes and expenses. A payment total is not automatically revenue.
- Respect date ranges, voided payments and document statuses.
- Keep currencies separate. Do not aggregate SYP and foreign currencies without an explicit conversion basis and the applicable workspace exchange rate.

## Additional response and lifecycle rules from `page.html`

- Payment records expose `is_voided` and `void_reason`; a voided payment remains part of the record history. Never describe this operation as permanent erasure.
- `GET /payment-methods` is a non-paginated read endpoint returning the accepted method codes for `POST /payments`. Use the returned/documented code, not a translated label or an assumed code.
- Credit-note list filters are `status`, `customer_id` and `currency`. Create/update fields are `customer_id`, `currency`, `amount`, `reason`, `issued_at` and `notes` (with the documented required/optional flags in the main section above).
- Once a credit note has been sent or shared, only `notes` may be changed; it cannot be deleted (HTTP 409). An update that reduces funding for an already-applied balance is rejected with HTTP 422. Check the credit note's state before attempting any update/delete.
- Recurring-invoice responses may include `last_generated_at`, `generated_count` and `cycle_total`; these are server-reported schedule-generation facts. Do not infer that a schedule generated or delivered an invoice unless the corresponding invoice record exists.
- The developer reference's DELETE `/recurring-invoices/{id}` example returns HTTP 204 with no response body; treat that as successful deletion when the status confirms it.
