import test from "node:test";
import assert from "node:assert/strict";
import { enforceAuthorizationAbuseProtection, AuthorizationAbuseError } from "../src/rate-limit-client.mjs";

const secret = "test-only-rate-limit-secret-with-at-least-32-bytes";
function harness({ ipDecision = { allowed: true }, credentialDecision = { allowed: true } } = {}) {
  const names = [];
  const calls = [];
  const namespace = {
    idFromName(name) { names.push(name); return name; },
    get(id) {
      return {
        async consumeIpAttempt() { calls.push(["ip", id]); return ipDecision; },
        async consumeValidation() { calls.push(["credential", id]); return credentialDecision; },
      };
    },
  };
  return { env: { RATE_LIMIT_HMAC_SECRET: secret, RATE_LIMITER: namespace }, names, calls };
}
function request(ip = "203.0.113.7") {
  return new Request("https://auth.example.test/authorize", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip },
  });
}

test("authorization checks IP and credential buckets before validation", async () => {
  const h = harness();
  await enforceAuthorizationAbuseProtection(request(), "sk_live_test_credential_1234567890", h.env);
  assert.equal(h.calls.length, 2);
  assert.match(h.names[0], /^ip:[a-f0-9]{64}$/);
  assert.match(h.names[1], /^credential:[a-f0-9]{64}$/);
  assert.equal(h.calls[0][0], "ip");
  assert.equal(h.calls[1][0], "credential");
});

test("authorization attempt protection rejects repeated submissions with 429 and retry information", async () => {
  const h = harness({ ipDecision: { allowed: false, retryAfterSeconds: 17 } });
  await assert.rejects(
    enforceAuthorizationAbuseProtection(request(), "sk_live_test_credential_1234567890", h.env),
    (error) => error instanceof AuthorizationAbuseError && error.status === 429 && error.retryAfterSeconds === 17,
  );
  assert.equal(h.calls.length, 1);
});

test("missing client IP fails closed before accessing the coordinator", async () => {
  const h = harness();
  await assert.rejects(
    enforceAuthorizationAbuseProtection(request(""), "sk_live_test_credential_1234567890", h.env),
    (error) => error instanceof AuthorizationAbuseError && error.status === 503,
  );
  assert.equal(h.calls.length, 0);
});

test("missing secret or Durable Object binding fails closed", async () => {
  const h = harness();
  await assert.rejects(
    enforceAuthorizationAbuseProtection(request(), "sk_live_test_credential_1234567890", { RATE_LIMITER: h.env.RATE_LIMITER }),
    (error) => error instanceof AuthorizationAbuseError && error.status === 503,
  );
  await assert.rejects(
    enforceAuthorizationAbuseProtection(request(), "sk_live_test_credential_1234567890", { RATE_LIMIT_HMAC_SECRET: secret }),
    (error) => error instanceof AuthorizationAbuseError && error.status === 503,
  );
});
