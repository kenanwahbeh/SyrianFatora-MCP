import { DurableObject } from "cloudflare:workers";

function positiveInteger(env, name) {
  const value = Number(env[name]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Rate-limit configuration is incomplete.");
  return value;
}
function windowConfig(env, limitName, windowName, bucket) {
  const limit = positiveInteger(env, limitName);
  const seconds = positiveInteger(env, windowName);
  const windowMs = seconds * 1000;
  if (!Number.isSafeInteger(windowMs)) throw new Error("Rate-limit window is invalid.");
  return { bucket, limit, windowMs };
}
function retryAfterSeconds(oldest, windowMs, now) {
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

export class CredentialRateLimiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS rate_events (bucket TEXT NOT NULL, occurred_at_ms INTEGER NOT NULL);" +
      "CREATE INDEX IF NOT EXISTS rate_events_bucket_time ON rate_events(bucket, occurred_at_ms);" +
      "CREATE TABLE IF NOT EXISTS rate_cooldowns (id INTEGER PRIMARY KEY CHECK (id = 1), until_ms INTEGER NOT NULL);"
    );
  }

  _maxRetentionWindowMs() {
    const seconds = [
      positiveInteger(this.env, "RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS"),
      positiveInteger(this.env, "RATE_LIMIT_GRANT_WINDOW_SECONDS"),
      positiveInteger(this.env, "RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS"),
      positiveInteger(this.env, "RATE_LIMIT_AUTH_IP_WINDOW_SECONDS"),
    ];
    const maxMs = Math.max(...seconds) * 1000;
    if (!Number.isSafeInteger(maxMs)) throw new Error("Rate-limit window is invalid.");
    return maxMs;
  }

  _consume(entries) {
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      const cooldown = this.ctx.storage.sql.exec(
        "SELECT until_ms FROM rate_cooldowns WHERE id = 1"
      ).toArray()[0];
      if (cooldown && Number(cooldown.until_ms) > now) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((Number(cooldown.until_ms) - now) / 1000)),
          reason: "upstream_cooldown",
        };
      }

      this.ctx.storage.sql.exec(
        "DELETE FROM rate_events WHERE occurred_at_ms <= ?",
        now - this._maxRetentionWindowMs()
      );

      const accepted = [];
      for (const entry of entries) {
        this.ctx.storage.sql.exec(
          "DELETE FROM rate_events WHERE bucket = ? AND occurred_at_ms <= ?",
          entry.bucket, now - entry.windowMs
        );
        const row = this.ctx.storage.sql.exec(
          "SELECT COUNT(*) AS event_count, MIN(occurred_at_ms) AS oldest_event FROM rate_events WHERE bucket = ?",
          entry.bucket
        ).toArray()[0];
        if (Number(row?.event_count ?? 0) >= entry.limit) {
          return {
            allowed: false,
            retryAfterSeconds: retryAfterSeconds(Number(row.oldest_event), entry.windowMs, now),
            reason: "quota_exceeded",
          };
        }
        accepted.push(entry);
      }

      for (const entry of accepted) {
        this.ctx.storage.sql.exec(
          "INSERT INTO rate_events (bucket, occurred_at_ms) VALUES (?, ?)",
          entry.bucket, now
        );
      }
      return { allowed: true };
    });
  }

  consumeIpAttempt() {
    return this._consume([windowConfig(
      this.env,
      "RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS",
      "RATE_LIMIT_AUTH_IP_WINDOW_SECONDS",
      "auth_ip"
    )]);
  }

  consumeValidation() {
    return this._consume([
      windowConfig(
        this.env,
        "RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS",
        "RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS",
        "auth_credential_attempts"
      ),
      windowConfig(
        this.env,
        "RATE_LIMIT_CREDENTIAL_MAX_REQUESTS",
        "RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS",
        "credential"
      ),
    ]);
  }

  consumeProxy({ grantFingerprint }) {
    if (typeof grantFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(grantFingerprint)) {
      throw new Error("Rate-limit identity is invalid.");
    }
    return this._consume([
      windowConfig(
        this.env,
        "RATE_LIMIT_GRANT_MAX_REQUESTS",
        "RATE_LIMIT_GRANT_WINDOW_SECONDS",
        "grant:" + grantFingerprint
      ),
      windowConfig(
        this.env,
        "RATE_LIMIT_CREDENTIAL_MAX_REQUESTS",
        "RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS",
        "credential"
      ),
    ]);
  }

  recordUpstream429({ retryAfterHeader }) {
    const fallback = positiveInteger(this.env, "RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS");
    let requested = fallback;
    if (typeof retryAfterHeader === "string" && retryAfterHeader.trim()) {
      const seconds = Number(retryAfterHeader.trim());
      if (Number.isFinite(seconds) && seconds >= 0) {
        requested = Math.max(fallback, Math.ceil(seconds));
      } else {
        const dateMs = Date.parse(retryAfterHeader);
        if (Number.isFinite(dateMs)) requested = Math.max(fallback, Math.ceil((dateMs - Date.now()) / 1000));
      }
    }
    const untilMs = Date.now() + requested * 1000;
    if (!Number.isSafeInteger(untilMs)) throw new Error("Rate-limit cooldown is invalid.");
    this.ctx.storage.transactionSync(() => {
      const old = this.ctx.storage.sql.exec(
        "SELECT until_ms FROM rate_cooldowns WHERE id = 1"
      ).toArray()[0];
      const finalUntil = Math.max(Number(old?.until_ms ?? 0), untilMs);
      this.ctx.storage.sql.exec(
        "INSERT INTO rate_cooldowns (id, until_ms) VALUES (1, ?) " +
        "ON CONFLICT(id) DO UPDATE SET until_ms = excluded.until_ms",
        finalUntil
      );
    });
    return { recorded: true, retryAfterSeconds: requested };
  }
}
