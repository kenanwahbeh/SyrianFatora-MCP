import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { rm } from "node:fs/promises";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = path.join(root, "test-support/rate-limiter-runtime-worker.mjs");
const bundleDir = path.join(root, "test/.tmp-rate-limiter-runtime");
const scriptPath = path.join(bundleDir, "rate-limiter-runtime-worker.js");
const config = {
  RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS: "7",
  RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: "60",
  RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS: "2",
  RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS: "60",
  RATE_LIMIT_CREDENTIAL_MAX_REQUESTS: "1",
  RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS: "60",
  RATE_LIMIT_GRANT_MAX_REQUESTS: "5",
  RATE_LIMIT_GRANT_WINDOW_SECONDS: "60",
  RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS: "30",
};
let mf;
let limiter;
let id;
let storage;

before(async () => {
  await rm(bundleDir, { recursive: true, force: true });
  await build({
    configFile: false,
    logLevel: "warn",
    build: {
      lib: { entry: sourcePath, formats: ["es"], fileName: "rate-limiter-runtime-worker" },
      outDir: bundleDir,
      emptyOutDir: true,
      rollupOptions: { external: ["cloudflare:workers"] },
    },
  });
  mf = new Miniflare(convertV4MiniflareOptions({
    unsafeInspectDurableObjects: true,
    workers: [{
      name: "limiter",
      scriptPath,
      modules: true,
      compatibilityDate: "2026-11-17",
      bindings: config,
      durableObjects: { RATE_LIMITER: { className: "CredentialRateLimiter", useSQLite: true } },
    }],
  }));
  await mf.ready;
  const ns = await mf.getDurableObjectNamespace("RATE_LIMITER", "limiter");
  id = ns.idFromName("credential:runtime-test");
  limiter = ns.get(id);
  storage = await mf.unsafeGetDurableObjectStorage("limiter", "CredentialRateLimiter", { id: id.toString() });
});

after(async () => { await mf?.dispose(); await rm(bundleDir, { recursive: true, force: true }); });

test("SQLite DO serializes concurrent attempts and enforces the strict limit", async () => {
  const decisions = await Promise.all(Array.from({ length: 50 }, () => limiter.consumeIpAttempt()));
  assert.equal(decisions.filter((x) => x.allowed).length, 7);
  assert.equal(decisions.filter((x) => !x.allowed).length, 43);
  const rows = await storage.exec("SELECT COUNT(*) AS count FROM rate_events WHERE bucket = ?", "auth_ip");
  assert.equal(Number(rows[0].count), 7);
});

test("rejected multi-bucket attempts do not partially charge the earlier bucket", async () => {
  const first = await limiter.consumeValidation();
  const second = await limiter.consumeValidation();
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.reason, "quota_exceeded");
  const rows = await storage.exec("SELECT bucket, COUNT(*) AS count FROM rate_events GROUP BY bucket ORDER BY bucket");
  const counts = Object.fromEntries(rows.map((row) => [row.bucket, Number(row.count)]));
  assert.equal(counts.auth_credential_attempts, 1);
  assert.equal(counts.credential, 1);
});

test("upstream 429 cooldown blocks subsequent requests inside the same SQLite object", async () => {
  await limiter.recordUpstream429({ retryAfterHeader: "120" });
  const decision = await limiter.consumeIpAttempt();
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "upstream_cooldown");
  assert.ok(decision.retryAfterSeconds >= 1);
});
