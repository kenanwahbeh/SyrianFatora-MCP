export function isAllowedMcpOrigin(request, workerEnv = {}) {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  if (!origin || origin === "null") return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.origin !== origin ||
      (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) ||
      parsed.username || parsed.password) return false;
  if (origin === new URL(request.url).origin) return true;

  const configured = typeof workerEnv.MCP_ALLOWED_ORIGINS === "string"
    ? workerEnv.MCP_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  return configured.includes(origin);
}
