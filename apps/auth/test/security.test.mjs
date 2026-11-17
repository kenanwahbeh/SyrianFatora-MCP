import test from "node:test";
import assert from "node:assert/strict";
import {
  CredentialValidationError,
  escapeHtml,
  SYRIANFATORA_API_BASE,
  validateSyrianFatoraKey,
  readUrlEncodedForm,
} from "../src/security.mjs";

test("escapeHtml encodes all HTML-sensitive characters", () => {
  assert.equal(escapeHtml(`<script a="b">Tom & 'Jerry'</script>`),
    "&#60;script a=&#34;b&#34;&#62;Tom &#38; &#39;Jerry&#39;&#60;/script&#62;");
});

test("validates the key using a read-only customers request", async () => {
  let observed;
  const fetchMock = async (url, options) => {
    observed = { url, options };
    return new Response(null, { status: 200 });
  };

  assert.equal(await validateSyrianFatoraKey("sk_live_test_key_value_123456", fetchMock), true);
  assert.equal(observed.url, `${SYRIANFATORA_API_BASE}/customers?per_page=1`);
  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.headers.Authorization, "Bearer sk_live_test_key_value_123456");
  assert.equal(observed.options.redirect, "error");
});

test("rejects invalid credentials without exposing the supplied key", async () => {
  const secret = "sk_live_never_echo_this_secret_123";
  await assert.rejects(
    () => validateSyrianFatoraKey(secret, async () => new Response(null, { status: 401 })),
    (error) => {
      assert.ok(error instanceof CredentialValidationError);
      assert.equal(error.code, "invalid_key");
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("explains the minimum read permission on HTTP 403", async () => {
  await assert.rejects(
    () => validateSyrianFatoraKey("sk_live_test_key_value_123456", async () => new Response(null, { status: 403 })),
    (error) => error.code === "missing_permission" && error.status === 400,
  );
});

test("preserves upstream rate-limit status as a retryable failure", async () => {
  await assert.rejects(
    () => validateSyrianFatoraKey("sk_live_test_key_value_123456", async () => new Response(null, { status: 429 })),
    (error) => error.code === "rate_limited" && error.status === 429,
  );
});

test("rejects malformed keys before making a network request", async () => {
  let called = false;
  await assert.rejects(
    () => validateSyrianFatoraKey("short", async () => { called = true; return new Response(null); }),
    (error) => error.code === "invalid_format",
  );
  assert.equal(called, false);
});

test("parses only bounded URL-encoded authorization forms", async () => {
  const request = new Request("https://auth.example.test/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "handle=one-time&decision=approve&scope=mcp%3Aread",
  });
  const form = await readUrlEncodedForm(request);
  assert.equal(form.get("handle"), "one-time");
  assert.equal(form.get("decision"), "approve");
  assert.deepEqual(form.getAll("scope"), ["mcp:read"]);
});

test("rejects unsupported form encodings", async () => {
  const request = new Request("https://auth.example.test/authorize", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: "--test--",
  });
  await assert.rejects(
    () => readUrlEncodedForm(request),
    (error) => error.code === "invalid_form" && error.status === 415,
  );
});

test("rejects oversized form bodies while streaming", async () => {
  const request = new Request("https://auth.example.test/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "x=".concat("a".repeat(100)),
  });
  await assert.rejects(
    () => readUrlEncodedForm(request, 32),
    (error) => error.code === "request_too_large" && error.status === 413,
  );
});
