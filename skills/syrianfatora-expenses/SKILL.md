---
name: syrianfatora-expenses
description: Manage SyrianFatora suppliers, business expenses, expense categories and exchange-rate records through the connected MCP tools with documented fields and filters.
---

# SyrianFatora — Purchases and expenses

Apply `syrianfatora-core` for permissions, safe writes, pagination, rate limits and exact field validation.

## Registered tools

- Suppliers: `suppliers_list`, `suppliers_get`, `suppliers_create`, `suppliers_update`, `suppliers_delete`.
- Expenses: `expenses_list`, `expenses_get`, `expenses_create`, `expenses_update`, `expenses_delete`.
- Expense categories: `expense_categories_list`, `expense_categories_get`, `expense_categories_create`, `expense_categories_update`, `expense_categories_delete`.
- Exchange rates: `exchange_rates_list`, `exchange_rates_get`, `exchange_rates_create`, `exchange_rates_update`, `exchange_rates_delete`.

## Suppliers

- List filters: `search` (free-text search across primary fields), `per_page` and `page`.
- Create/update body:
  - Required: `name`.
  - Optional: `contact_name`, `phone`, `email`, `tax_number`, `city`, `address`, `notes`, `is_active`.
- Search existing suppliers before creating. Do not invent tax IDs, contact details, addresses, payment terms or currency preferences.
- Update/delete only a known supplier ID and only when explicitly requested. A supplier still referenced by an expense may be protected by a conflict.

## Expenses

- List filters: `status`, `supplier_id`, `category_id`; pagination uses `per_page` and `page`.
- Create/update body:
  - Required: `title`, `category_id`, `status` (`unpaid` or `cancelled`), `bill_date` (YYYY-MM-DD), `currency`, `amount` (>= 0).
  - Optional: `supplier_id`, `reference`, `due_date`, `exchange_rate` (when currency differs from workspace base currency), `notes`.
- Resolve `category_id` using `expense_categories_list` and `supplier_id` using `suppliers_list`; never guess IDs.
- Check for a likely duplicate before creating. Preserve the entered amount and currency exactly. Do not silently convert currency or infer tax treatment.
- Update/delete only the exact selected expense. Deletion changes live workspace data.

## Expense categories

- List filters: `search`, `is_active`, `per_page` and `page`.
- Create/update body:
  - Required: `name` (must be unique in the workspace), `color`.
  - `color` must be one of `gray`, `info`, `success`, `warning`, `danger`.
  - Optional: `description`, `icon`, `sort_order` (0–9999), `is_active`.
  - Documented icon values: `salary`, `rent`, `util`, `market`, `transport`, `supplies`, `software`, `tax`, `other`.
- Inspect existing categories before creating. Do not assume a category hierarchy.
- Avoid deleting a category referenced by expenses. If the API returns 409, report the conflict; do not work around it by altering existing expenses.

## Exchange rates

- List filter: `currency`; pagination uses `per_page` and `page`.
- Create/update body:
  - Required: `currency` (enabled workspace currency), `rate` (>= 0.000001), `effective_date` (YYYY-MM-DD).
- The documented schema has one currency code plus a rate and effective date; do not invent source/target currency fields.
- Never invent a rate or substitute a web-market quote for the workspace's accounting rate. Preserve decimal precision.
- Check for an existing rate for the same currency/date before creating. Do not overwrite an existing rate without explicit authorization.

## Expense summaries

- State the reporting period and currency. Distinguish expense records from supplier balances or payments; the available resources do not by themselves prove an expense has been paid.
- Paginate through all matching records before presenting a complete period total. If only a subset was retrieved, label it as partial.

## Additional expense response semantics from `page.html`

- Expense records include `status` (stored state) and `effective_status` (the example shows `partially_paid`), plus `has_receipt`, `total_paid` and `remaining_balance`. Do not infer that `status: unpaid` means no payment has ever been recorded; inspect the effective status and payment totals.
- Expense responses embed a `payments` array. Each embedded payment may include `expense_id`, `amount`, `currency`, `exchange_rate`, `amount_in_expense_currency`, `paid_at`, `method` and `note`. These are part of the expense response; the developer reference does not document a separate public expense-payment endpoint or a corresponding MCP tool. Do not invent one.
- The expense API's documented create/update `status` values are `unpaid` and `cancelled`; `effective_status` is a separate response field and must not be sent as a substitute for `status`.
- A supplier referenced by an expense cannot be deleted (HTTP 409). An expense category still used by expenses cannot be deleted (HTTP 409). Preserve these constraints; do not work around them by modifying dependent records.
