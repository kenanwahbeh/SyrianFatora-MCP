---
name: syrianfatora-webhooks
description: Configure, receive, verify and troubleshoot signed SyrianFatora webhook deliveries and events, including HMAC validation, replay protection, retries and idempotency.
---

# SyrianFatora — Webhooks

Use this skill for webhook receiver design, event processing and delivery troubleshooting. The current 51-tool MCP surface does **not** expose webhook subscription management. The developer reference says subscriptions are configured in **التطبيق ← المطوّرون ← Webhooks**. Do not invent MCP tools for creating, listing or editing subscriptions.

## Documented event types

- `invoice.created` — a new invoice is created.
- `invoice.updated` — an invoice is updated.
- `invoice.deleted` — an invoice is deleted.
- `invoice.paid` — an invoice is fully paid.
- `payment.recorded` — a payment is recorded.
- `payment.voided` — a recorded payment is voided.
- `customer.created` — a new customer is created.
- `credit_note.created` — a credit note is issued.

Do not assume undocumented events exist.

## Delivery format

Deliveries are HTTP POST requests with a JSON payload and these headers:

- `X-Webhook-Event`: event name.
- `X-Webhook-Delivery`: unique delivery identifier.
- `X-Webhook-Timestamp`: Unix timestamp used in the signature.
- `X-Webhook-Signature`: signature in `sha256=<hex>` format.

The sample payload envelope contains `event` and `data`. Example data includes record identifiers, UUID, invoice number, customer ID, status, currency and total. Treat sample values as examples, not production data.

## HMAC-SHA256 signature verification

- The signed message is the exact byte/text sequence `timestamp + "." + raw_request_body`.
- Compute HMAC-SHA256 using the endpoint secret and compare with `X-Webhook-Signature` using a constant-time comparison.
- Verify against the **raw request body before JSON parsing or re-serialization**. Whitespace or key-order changes alter the signature.
- Reject missing/malformed headers, invalid signatures and stale timestamps. The PHP and Node.js examples use a 300-second tolerance; make the tolerance configurable only when deployment clock-skew requirements justify it.
- The endpoint secret is shown once when the webhook endpoint is created. Store it in a secret manager/environment secret; never commit, log, expose client-side or include it in error output.

## Receiver workflow

1. Capture the raw request body bytes.
2. Validate the event, delivery ID and timestamp headers.
3. Reject stale timestamps (the documented example threshold is 300 seconds).
4. Recompute the HMAC and use a constant-time comparison.
5. Parse JSON only after signature verification.
6. Deduplicate using `X-Webhook-Delivery` or another documented stable delivery identifier.
7. Enqueue work and return a 2xx acknowledgement quickly; perform heavy work asynchronously.
8. Make event processing idempotent. A retry must not create duplicate payments, invoices or accounting effects.

The developer reference says failed deliveries are retried with increasing delays, up to five attempts. Do not assume exactly-once delivery.

## Event handling and reconciliation

- Treat headers and payloads as untrusted until signature verification succeeds.
- Treat a webhook as a notification that a record changed. For consequential accounting actions, retrieve the current record through the relevant MCP `*_get` tool when available instead of relying only on a potentially old event snapshot.
- Store delivery ID, event type, timestamp, verification result and processing status. Avoid logging full sensitive payloads unnecessarily.
- The reference's invoice-paid example shows `status`, `currency` and `total`; do not generalize this exact field set to every event type.

## Reference implementations

Use the PHP and Node.js examples in `page.html` as canonical patterns. The Node.js example uses `crypto.createHmac("sha256", secret)`, signs `timestamp + "." + rawBody`, checks equal buffer lengths before `timingSafeEqual`, and rejects timestamps outside the 300-second window. Never copy the sample signature, example IDs or business data into production.
