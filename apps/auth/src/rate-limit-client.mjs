export class RateLimitError extends Error {
  constructor(status = 503, retryAfterSeconds = null) {
    super(status === 429 ? "Rate limit exceeded." : "Rate limiter unavailable.");
    this.name = "RateLimitError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
async function fingerprint(secret, purpose, value) {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.byteLength < 32) throw new Error("Rate-limit key is invalid.");
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = new TextEncoder().encode(purpose + "\u0000" + value);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("");
}
function stubFor(env, name) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.idFromName !== "function") throw new Error("Rate limiter binding is missing.");
  return env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(name));
}
export async function enforceAuthorizationRateLimit(request, apiKey, env) {
  try {
    const secret = env.RATE_LIMIT_HMAC_SECRET;
    if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) throw new Error("Rate-limit secret is missing.");
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) throw new Error("Client IP is unavailable.");
    const ipHash = await fingerprint(secret, "ip", ip);
    const ipDecision = await stubFor(env, "ip:" + ipHash).consumeIpAttempt();
    if (!ipDecision?.allowed) throw new RateLimitError(429, ipDecision?.retryAfterSeconds ?? 1);
    const credentialHash = await fingerprint(secret, "credential", String(apiKey ?? ""));
    const credentialDecision = await stubFor(env, "credential:" + credentialHash).consumeValidation();
    if (!credentialDecision?.allowed) throw new RateLimitError(429, credentialDecision?.retryAfterSeconds ?? 1);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    throw new RateLimitError(503);
  }
}
