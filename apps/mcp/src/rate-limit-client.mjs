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
async function credentialStub(env, props) {
  const secret = env.RATE_LIMIT_HMAC_SECRET;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("Rate-limit secret is missing.");
  }
  const apiKey = props?.provider === "syrianfatora" ? props.upstreamApiKey : null;
  if (typeof apiKey !== "string" || apiKey.length < 20 || apiKey.length > 512) {
    throw new Error("Authorization credential is invalid.");
  }
  const credentialHash = await fingerprint(secret, "credential", apiKey);
  return stubFor(env, "credential:" + credentialHash);
}
export async function consumeMcpRequest(env, props) {
  try {
    const stub = await credentialStub(env, props);
    return await stub.checkUpstreamCooldown();
  } catch {
    throw new Error("Rate limiter unavailable.");
  }
}
export async function recordUpstreamRateLimit(env, props, retryAfterHeader) {
  try {
    const stub = await credentialStub(env, props);
    return await stub.recordUpstream429({ retryAfterHeader });
  } catch {
    throw new Error("Rate limiter unavailable.");
  }
}
