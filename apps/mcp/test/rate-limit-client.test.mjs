import test from "node:test";
import assert from "node:assert/strict";
import { checkUpstreamCooldown, recordProviderCooldown } from "../src/rate-limit-client.mjs";

const secret = "test-only-rate-limit-secret-with-at-least-32-bytes";
const props = {
  provider: "syrianfatora",
  upstreamApiKey: "sk_live_test_credential_1234567890",
};
function harness() {
  const names = [];
  const calls = [];
  const namespace = {
    idFromName(name) { names.push(name); return name; },
    get(id) {
      return {
        async checkUpstreamCooldown() { calls.push(["checkUpstreamCooldown", id]); return { allowed: true }; },
        async recordUpstream429(input) { calls.push(["recordUpstream429", id, input]); return { recorded: true }; },
      };
    },
  };
  return { env: { RATE_LIMIT_HMAC_SECRET: secret, RATE_LIMITER: namespace }, names, calls };
}

test("MCP requests check only provider-issued cooldown and do not charge local quota buckets", async () => {
  const h = harness();
  const result = await checkUpstreamCooldown(h.env, props);
  assert.equal(result.allowed, true);
  assert.match(h.names[0], /^credential:[a-f0-9]{64}$/);
  assert.equal(h.calls[0][0], "checkUpstreamCooldown");
  assert.equal(h.calls[0].length, 2);
});

test("upstream 429 cooldown is recorded on the same credential object", async () => {
  const h = harness();
  await recordProviderCooldown(h.env, props, "23");
  assert.equal(h.names.length, 1);
  assert.equal(h.calls[0][0], "recordUpstream429");
  assert.equal(h.calls[0][2].retryAfterHeader, "23");
});

test("missing secret or Durable Object binding fails closed", async () => {
  const h = harness();
  await assert.rejects(checkUpstreamCooldown({ RATE_LIMITER: h.env.RATE_LIMITER }, props));
  await assert.rejects(checkUpstreamCooldown({ RATE_LIMIT_HMAC_SECRET: secret }, props));
});

test("invalid upstream credential fails closed", async () => {
  const h = harness();
  await assert.rejects(checkUpstreamCooldown(h.env, { ...props, upstreamApiKey: "" }));
  assert.equal(h.calls.length, 0);
});
