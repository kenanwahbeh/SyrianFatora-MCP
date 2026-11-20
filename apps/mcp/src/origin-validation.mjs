export function isAllowedMcpOrigin(request, workerEnv = {}) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) return false;
  if (origin === new URL(request.url).origin) return true;

  const configured = typeof workerEnv.MCP_ALLOWED_ORIGINS === "string"
    ? workerEnv.MCP_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  return configured.includes(origin);
}
