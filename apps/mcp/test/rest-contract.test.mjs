import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_CONTRACTS } from "../src/rest-contract.mjs";

const expected = {
  customers: {
    query: ["page", "per_page", "search"],
    create: ["name", "email", "phone", "city", "address", "notes", "default_currency", "default_language"],
  },
  invoices: {
    query: ["page", "per_page", "status", "customer_id"],
    create: ["customer_id", "status", "invoice_date", "due_date", "currency", "exchange_rate", "language", "discount_type", "discount", "tax_mode", "tax_rate", "notes", "items"],
  },
  items: {
    query: ["page", "per_page", "type", "search", "is_active", "unit", "min_price", "max_price"],
    create: ["name", "type", "code", "description", "default_unit_price", "tax_rate", "unit", "is_active"],
    update: ["name", "type", "code", "description", "default_unit_price", "tax_rate", "unit", "is_active"],
  },
  quotes: {
    query: ["page", "per_page", "status", "customer_id"],
    create: ["customer_id", "currency", "exchange_rate", "language", "discount_type", "discount", "tax_mode", "tax_rate", "notes", "items", "status", "quote_date", "valid_until"],
    update: ["customer_id", "currency", "exchange_rate", "language", "discount_type", "discount", "tax_mode", "tax_rate", "notes", "items", "status", "quote_date", "valid_until"],
  },
  "credit-notes": {
    query: ["page", "per_page", "status", "customer_id", "currency"],
    create: ["customer_id", "currency", "amount", "reason", "issued_at", "notes"],
    update: ["customer_id", "currency", "amount", "reason", "issued_at", "notes"],
  },
  payments: {
    query: ["page", "per_page", "invoice_id"],
    create: ["invoice_id", "amount", "currency", "exchange_rate", "paid_at", "method", "note"],
    delete: ["void_reason"],
  },
  "payment-methods": {},
  "recurring-invoices": {
    query: ["page", "per_page", "status", "customer_id", "frequency"],
    create: ["customer_id", "currency", "exchange_rate", "language", "discount_type", "discount", "tax_mode", "tax_rate", "notes", "items", "frequency", "interval_count", "start_date", "next_run_date", "end_date", "is_active"],
    update: ["customer_id", "currency", "exchange_rate", "language", "discount_type", "discount", "tax_mode", "tax_rate", "notes", "items", "frequency", "interval_count", "start_date", "next_run_date", "end_date", "is_active"],
  },
  expenses: {
    query: ["page", "per_page", "status", "supplier_id", "category_id"],
    create: ["title", "category_id", "supplier_id", "reference", "status", "bill_date", "due_date", "currency", "exchange_rate", "amount", "notes"],
    update: ["title", "category_id", "supplier_id", "reference", "status", "bill_date", "due_date", "currency", "exchange_rate", "amount", "notes"],
  },
  suppliers: {
    query: ["page", "per_page", "search"],
    create: ["name", "contact_name", "phone", "email", "tax_number", "city", "address", "notes", "is_active"],
    update: ["name", "contact_name", "phone", "email", "tax_number", "city", "address", "notes", "is_active"],
  },
  "expense-categories": {
    query: ["page", "per_page", "search", "is_active"],
    create: ["name", "description", "color", "icon", "sort_order", "is_active"],
    update: ["name", "description", "color", "icon", "sort_order", "is_active"],
  },
  "exchange-rates": {
    query: ["page", "per_page", "currency"],
    create: ["currency", "rate", "effective_date"],
    update: ["currency", "rate", "effective_date"],
  },
};

test("all 12 resource query and request-body schemas match page.html field inventories", () => {
  assert.deepEqual(Object.keys(RESOURCE_CONTRACTS).sort(), Object.keys(expected).sort());
  for (const [resource, actions] of Object.entries(expected)) {
    for (const [action, fields] of Object.entries(actions)) {
      const schema = RESOURCE_CONTRACTS[resource][action];
      assert.ok(schema, `${resource} missing ${action} schema`);
      assert.deepEqual(Object.keys(schema.properties).sort(), [...fields].sort(),
        `${resource}.${action} fields differ from page.html`);
      assert.equal(schema.additionalProperties, false);
    }
  }
});

test("all documented body schemas require their mandatory fields", () => {
  const required = {
    customers: { create: ["name"] },
    invoices: { create: ["customer_id", "status", "invoice_date", "currency", "language", "discount_type", "tax_mode", "items"] },
    items: { create: ["name", "type", "default_unit_price"], update: ["name", "type", "default_unit_price"] },
    quotes: { create: ["customer_id", "status", "quote_date", "currency", "language", "discount_type", "tax_mode", "items"], update: ["customer_id", "status", "quote_date", "currency", "language", "discount_type", "tax_mode", "items"] },
    "credit-notes": { create: ["customer_id", "currency", "amount", "issued_at"], update: ["customer_id", "currency", "amount", "issued_at"] },
    payments: { create: ["invoice_id", "amount", "currency", "paid_at", "method"], delete: ["void_reason"] },
    "recurring-invoices": { create: ["customer_id", "currency", "language", "frequency", "interval_count", "start_date", "next_run_date", "discount_type", "tax_mode", "items"], update: ["customer_id", "currency", "language", "frequency", "interval_count", "start_date", "next_run_date", "discount_type", "tax_mode", "items"] },
    expenses: { create: ["title", "category_id", "status", "bill_date", "currency", "amount"], update: ["title", "category_id", "status", "bill_date", "currency", "amount"] },
    suppliers: { create: ["name"], update: ["name"] },
    "expense-categories": { create: ["name", "color"], update: ["name", "color"] },
    "exchange-rates": { create: ["currency", "rate", "effective_date"], update: ["currency", "rate", "effective_date"] },
  };
  for (const [resource, actions] of Object.entries(required)) {
    for (const [action, fields] of Object.entries(actions)) {
      assert.deepEqual([...RESOURCE_CONTRACTS[resource][action].required].sort(), [...fields].sort(),
        `${resource}.${action} required fields differ`);
    }
  }
});

test("line items, enum sets and explicit numeric limits match the developer reference", () => {
  const line = RESOURCE_CONTRACTS.invoices.create.properties.items.items;
  assert.deepEqual(line.required, ["title", "qty", "unit_price", "discount_type"]);
  assert.equal(line.properties.qty.exclusiveMinimum, 0);
  assert.equal(line.properties.unit_price.minimum, 0);
  assert.deepEqual(RESOURCE_CONTRACTS.items.create.properties.type.enum, ["product", "service"]);
  assert.deepEqual(RESOURCE_CONTRACTS.expenses.create.properties.status.enum, ["unpaid", "cancelled"]);
  assert.deepEqual(RESOURCE_CONTRACTS["expense-categories"].create.properties.color.enum,
    ["gray", "info", "success", "warning", "danger"]);
  assert.equal(RESOURCE_CONTRACTS.payments.create.properties.method.type, "string");
  assert.equal(RESOURCE_CONTRACTS.payments.create.properties.method.enum, undefined);
  assert.equal(RESOURCE_CONTRACTS["exchange-rates"].create.properties.rate.minimum, 0.000001);
  assert.equal(RESOURCE_CONTRACTS["recurring-invoices"].create.properties.interval_count.maximum, 365);
});
