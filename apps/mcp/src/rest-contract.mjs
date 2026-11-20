const S = { type: "string" };
const N = { type: "number" };
const I = { type: "integer" };
const B = { type: "boolean" };

const str = (extra = {}) => ({ ...S, ...extra });
const num = (extra = {}) => ({ ...N, ...extra });
const int = (extra = {}) => ({ ...I, ...extra });
const choice = (...values) => ({ ...S, enum: values });
const date = (extra = {}) => ({ ...S, format: "date", ...extra });
const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const lineItems = {
  type: "array",
  minItems: 1,
  items: object({
    item_id: int({ description: "Optional link to an existing catalog item." }),
    title: str(),
    qty: num({ exclusiveMinimum: 0 }),
    unit_price: num({ minimum: 0 }),
    discount_type: choice("fixed", "percent"),
    discount_value: num(),
    tax_rate: num(),
  }, ["title", "qty", "unit_price", "discount_type"]),
};
const documentFields = {
  customer_id: int({ description: "Must identify a customer in the current workspace." }),
  currency: str(),
  exchange_rate: num({ description: "Required when the document currency differs from the workspace base currency." }),
  language: choice("ar", "en", "tr"),
  discount_type: choice("fixed", "percent"),
  discount: num(),
  tax_mode: choice("invoice", "line"),
  tax_rate: num(),
  notes: str(),
  items: lineItems,
};
const documentRequired = ["customer_id", "currency", "language", "discount_type", "tax_mode", "items"];

const customerBody = object({
  name: str(),
  email: str(),
  phone: str(),
  city: str(),
  address: str(),
  notes: str(),
  default_currency: str(),
  default_language: str(),
}, ["name"]);

const invoiceBody = object({
  ...documentFields,
  status: choice("draft", "published"),
  invoice_date: date(),
  due_date: date(),
}, [...documentRequired, "status", "invoice_date"]);

const itemBody = object({
  name: str(),
  type: choice("product", "service"),
  code: str({ description: "Optional code; it must be unique in the workspace." }),
  description: str(),
  default_unit_price: num({ minimum: 0 }),
  tax_rate: num({ minimum: 0, maximum: 100 }),
  unit: str(),
  is_active: B,
}, ["name", "type", "default_unit_price"]);

const quoteBody = object({
  ...documentFields,
  status: choice("draft", "sent"),
  quote_date: date(),
  valid_until: date({ description: "When supplied, must be on or after quote_date." }),
}, [...documentRequired, "status", "quote_date"]);

const creditNoteBody = object({
  customer_id: int({ description: "Must identify a customer in the current workspace." }),
  currency: str(),
  amount: num({ minimum: 0.01 }),
  reason: str(),
  issued_at: date(),
  notes: str(),
}, ["customer_id", "currency", "amount", "issued_at"]);

const paymentBody = object({
  invoice_id: int({ description: "Must identify an invoice in the current workspace." }),
  amount: num({ minimum: 0.01 }),
  currency: str(),
  exchange_rate: num({ description: "Required when the payment currency differs from the workspace base currency." }),
  paid_at: date(),
  method: str({ description: "Payment-method code returned by GET /payment-methods; do not use the display label." }),
  note: str(),
}, ["invoice_id", "amount", "currency", "paid_at", "method"]);

const recurringInvoiceBody = object({
  ...documentFields,
  frequency: choice("weekly", "monthly", "yearly"),
  interval_count: int({ minimum: 1, maximum: 365 }),
  start_date: date(),
  next_run_date: date(),
  end_date: date({ description: "When supplied, must be on or after start_date." }),
  is_active: B,
}, [...documentRequired, "frequency", "interval_count", "start_date", "next_run_date"]);

const expenseBody = object({
  title: str(),
  category_id: int({ description: "Must identify an existing expense category." }),
  supplier_id: int({ description: "Optional; when supplied, must identify an existing supplier." }),
  reference: str(),
  status: choice("unpaid", "cancelled"),
  bill_date: date(),
  due_date: date(),
  currency: str(),
  exchange_rate: num({ description: "Required when the expense currency differs from the workspace base currency." }),
  amount: num({ minimum: 0 }),
  notes: str(),
}, ["title", "category_id", "status", "bill_date", "currency", "amount"]);

const supplierBody = object({
  name: str(),
  contact_name: str(),
  phone: str(),
  email: str(),
  tax_number: str(),
  city: str(),
  address: str(),
  notes: str(),
  is_active: B,
}, ["name"]);

const expenseCategoryBody = object({
  name: str({ description: "Must be unique in the workspace." }),
  description: str(),
  color: choice("gray", "info", "success", "warning", "danger"),
  icon: choice("salary", "rent", "util", "market", "transport", "supplies", "software", "tax", "other"),
  sort_order: int({ minimum: 0, maximum: 9999 }),
  is_active: B,
}, ["name", "color"]);

const exchangeRateBody = object({
  currency: str(),
  rate: num({ minimum: 0.000001 }),
  effective_date: date(),
}, ["currency", "rate", "effective_date"]);

const pagination = {
  page: int({ minimum: 1 }),
  per_page: int({ minimum: 1, maximum: 100 }),
};
const query = (filters = {}) => object({ ...pagination, ...filters });

export const RESOURCE_CONTRACTS = {
  customers: {
    query: query({ search: str() }),
    create: customerBody,
  },
  invoices: {
    query: query({ status: str(), customer_id: int() }),
    create: invoiceBody,
  },
  items: {
    query: query({
      type: choice("product", "service"),
      search: str(),
      is_active: B,
      unit: str(),
      min_price: num(),
      max_price: num(),
    }),
    create: itemBody,
    update: itemBody,
  },
  quotes: {
    query: query({ status: str(), customer_id: int() }),
    create: quoteBody,
    update: quoteBody,
  },
  "credit-notes": {
    query: query({
      status: str(),
      customer_id: int(),
      currency: str(),
    }),
    create: creditNoteBody,
    update: creditNoteBody,
  },
  payments: {
    query: query({ invoice_id: int() }),
    create: paymentBody,
    delete: object({ void_reason: str({ minLength: 1 }) }, ["void_reason"]),
  },
  "payment-methods": {},
  "recurring-invoices": {
    query: query({
      status: choice("active", "paused"),
      customer_id: int(),
      frequency: choice("weekly", "monthly", "yearly"),
    }),
    create: recurringInvoiceBody,
    update: recurringInvoiceBody,
  },
  expenses: {
    query: query({
      status: str(),
      supplier_id: I,
      category_id: I,
    }),
    create: expenseBody,
    update: expenseBody,
  },
  suppliers: {
    query: query({ search: str() }),
    create: supplierBody,
    update: supplierBody,
  },
  "expense-categories": {
    query: query({ search: str(), is_active: B }),
    create: expenseCategoryBody,
    update: expenseCategoryBody,
  },
  "exchange-rates": {
    query: query({ currency: str() }),
    create: exchangeRateBody,
    update: exchangeRateBody,
  },
};

export function describeRestTool(resource, action, base) {
  if (action === "list") {
    return resource === "payment-methods"
      ? "List the supported payment-method codes. This endpoint is read-only and is not paginated."
      : `List ${resource} records using only the documented filters and pagination fields. ${base}`;
  }
  if (action === "get") return `Retrieve one ${resource} record by ID. ${base}`;
  if (action === "create") {
    if (resource === "payments") {
      return `Record a payment against an invoice. This immediately affects the invoice balance; USDT payments may return 202 with verification_pending. ${base}`;
    }
    return `Create a ${resource} record using the documented REST request fields. ${base}`;
  }
  if (action === "update") {
    const stateRule = resource === "quotes"
      ? "A sent/accepted locked quote cannot be updated (HTTP 409)."
      : resource === "credit-notes"
        ? "After a credit note is sent/shared, only notes may change; reducing an applied balance is rejected (HTTP 422)."
        : "";
    return `Replace an existing ${resource} record using the documented full request body. ${stateRule} Server-side lifecycle restrictions still apply. ${base}`;
  }
  if (resource === "payments") {
    return "Void a payment by ID. This is a soft delete; the payment remains in history with is_voided and void_reason. Supply the required REST field void_reason.";
  }
  const deleteRule = resource === "quotes"
    ? "A converted quote cannot be deleted (HTTP 409)."
    : resource === "credit-notes"
      ? "A sent/shared credit note cannot be deleted (HTTP 409)."
      : ["suppliers", "expense-categories"].includes(resource)
        ? "A record still referenced by an expense cannot be deleted (HTTP 409)."
        : "";
  return `Delete a ${resource} record by ID. ${deleteRule} Referenced records or protected lifecycle states may reject deletion with HTTP 409.`;
}
