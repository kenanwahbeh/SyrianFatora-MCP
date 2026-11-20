---
name: syrianfatora-sales
description: Manage SyrianFatora customers, products and services, sales invoices and quotations through the connected MCP tools, using the documented fields and filters.
---

# SyrianFatora — Sales operations

Apply `syrianfatora-core` for connection, permissions, pagination, safe writes and response handling.

## Registered tools

- Customers: `customers_list`, `customers_get`, `customers_create`.
- Items: `items_list`, `items_get`, `items_create`, `items_update`, `items_delete`.
- Invoices: `invoices_list`, `invoices_get`, `invoices_create`.
- Quotes: `quotes_list`, `quotes_get`, `quotes_create`, `quotes_update`, `quotes_delete`.

Customers and invoices do not expose update/delete tools in the current MCP server. Do not claim otherwise.

## Customers

- List filters: `search` (free-text search across primary fields), `per_page`; pagination also supports `page`.
- Create body:
  - Required: `name`.
  - Optional: `email`, `phone`, `city`, `address`, `notes`, `default_currency`, `default_language`.
- Use `customers_get` for a selected ID. Search before creating to reduce duplicates.
- Do not invent customer identity/contact details or default currency/language. Customer creation has no matching delete tool; do not create test customers that would remain in the workspace.

## Items (products and services)

- List filters: `type`, `search`, `is_active`, `unit`, `min_price`, `max_price`, `per_page`, and `page`. `min_price` and `max_price` bound the unit price.
- Create/update body fields:
  - Required: `name`, `type` (`product` or `service`), `default_unit_price` (>= 0).
  - Optional: `code` (must be unique in the workspace), `description`, `tax_rate` (0–100), `unit`, `is_active`.
- Search for an existing item before creating. Use only the exact ID returned by the API for update/delete.
- Deletion may return 409 when the item is still referenced. Do not bypass the conflict.

## Sales invoices

- List filters: `status`, `customer_id`, `per_page`, `page`.
- Create body:
  - Required: `customer_id`, `status` (`draft` or `published`), `invoice_date`, `currency`, `language` (`ar`, `en`, `tr`), `discount_type` (`fixed` or `percent`), `tax_mode` (`invoice` or `line`), `items` (at least one line).
  - Optional: `due_date`, `exchange_rate` (required for a foreign currency relative to the workspace base currency), `discount`, `tax_rate`, `notes`.
  - Each `items[]` line: optional `item_id`; required `title`, `qty` (> 0), `unit_price` (>= 0), `discount_type` (`fixed` or `percent`); optional `discount_value`, `tax_rate`.
- Never send invoice totals. The server calculates totals, tax and discounts.
- Creating a published invoice is a consequential business action. Confirm the requested status; do not assume a draft request authorizes publishing.
- There is no invoice update/delete tool. Do not create invoices as disposable tests because the MCP surface cannot clean them up.

## Quotations

- List filters: `status`, `customer_id`, `per_page`, `page`.
- Create/update body:
  - Required: `customer_id`, `status` (`draft` or `sent`), `quote_date`, `currency`, `language` (`ar`, `en`, `tr`), `discount_type` (`fixed` or `percent`), `tax_mode` (`invoice` or `line`), `items` (at least one line).
  - Optional: `valid_until` (must be on/after `quote_date`), `exchange_rate` (for foreign currency), `discount`, `tax_rate`, `notes`.
  - Each `items[]` line: optional `item_id`; required `title`, `qty` (> 0), `unit_price` (>= 0), `discount_type`; optional `discount_value`, `tax_rate`.
- Do not send calculated totals. Use draft status unless the user explicitly asks for sent status.
- Quote-to-invoice conversion is not a registered MCP tool. If needed, prepare an invoice body from the selected quote and request confirmation before creating it.

## Response and data handling

- List results are paginated and use `data`, `links`, `meta`; a single record is wrapped in `data`.
- Customer examples in `page.html` are illustrative only. Never reuse example IDs, names, email addresses or prices.

## Additional response and lifecycle rules from `page.html`

- Invoice list/get responses may include `uuid`, `invoice_no`, customer details, `subtotal`, `discount`, `tax`, `total`, line items and `public_url` (the public verification path). Treat these as server-returned values; do not construct or guess a verification URL or invoice number.
- Quote responses may include `effective_status`, `is_locked`, `is_converted`, `converted_invoice_id`, `sent_at`, `accepted_at`, `rejected_at` and `public_url`. These fields describe the quote lifecycle; inspect them before proposing a change.
- A sent/accepted locked quote cannot be updated. A converted quote cannot be deleted. Both operations return HTTP 409. Do not attempt to bypass this by editing related records.
- The quote create/update request is a full documented representation, not an assumed partial PATCH. Supply the required fields and line items exactly as the reference specifies.
- The developer reference lists invoice `status` as `draft` or `published`, and quote `status` as `draft` or `sent`. Do not substitute a status from another resource.
