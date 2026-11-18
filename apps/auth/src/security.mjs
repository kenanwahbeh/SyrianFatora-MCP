export const SYRIANFATORA_API_BASE = "https://syrianfatora.com/api/public/v1";

export class CredentialValidationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "CredentialValidationError";
    this.code = code;
    this.status = status;
  }
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

export function renderConsentScopes(scopes, requiredScopes = ["mcp:read"]) {
  if (!Array.isArray(scopes) || !Array.isArray(requiredScopes)) {
    throw new TypeError("Scope lists must be arrays.");
  }

  return scopes.map((scope) => {
    const required = requiredScopes.includes(scope);
    const attributes = required ? " checked required" : "";
    const label = required ? " (required)" : " (optional)";
    return `<label><input type="checkbox" name="scope" value="${escapeHtml(scope)}"${attributes}> ${escapeHtml(scope)}${label}</label>`;
  }).join("<br>");
}

export function validateConsentScopes(scopes, allowedScopes, requiredScopes = ["mcp:read"]) {
  if (!Array.isArray(scopes) || !Array.isArray(allowedScopes) || !Array.isArray(requiredScopes)) {
    throw new TypeError("Scope lists must be arrays.");
  }

  const selected = [...new Set(scopes)];
  if (selected.some((scope) => typeof scope !== "string" || !allowedScopes.includes(scope))) {
    throw new CredentialValidationError(
      "invalid_scope",
      "One or more selected permissions are not supported.",
      400,
    );
  }

  if (requiredScopes.some((scope) => !selected.includes(scope))) {
    throw new CredentialValidationError(
      "required_scope_missing",
      "Read access (mcp:read) is required to connect SyrianFatora.",
      400,
    );
  }

  return selected;
}

export async function readUrlEncodedForm(request, maxBytes = 8192) {
  const contentType = (request.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/x-www-form-urlencoded") {
    throw new CredentialValidationError(
      "invalid_form",
      "The authorization form format is not supported.",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    throw new CredentialValidationError(
      "request_too_large",
      "The authorization form is too large.",
      413,
    );
  }

  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();

  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new CredentialValidationError(
        "request_too_large",
        "The authorization form is too large.",
        413,
      );
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new URLSearchParams(new TextDecoder().decode(body));
}

/**
 * Validate a workspace API key using a harmless, read-only endpoint.
 * The key is never included in a URL, response body, or thrown error.
 */
export async function validateSyrianFatoraKey(apiKey, fetchImpl = fetch) {
  if (typeof apiKey !== "string" || apiKey.length < 20 || apiKey.length > 512) {
    throw new CredentialValidationError(
      "invalid_format",
      "The API key format is not valid. Check the key and try again.",
      400,
    );
  }

  let response;
  try {
    const signal = typeof AbortSignal?.timeout === "function"
      ? AbortSignal.timeout(10_000)
      : undefined;

    response = await fetchImpl(`${SYRIANFATORA_API_BASE}/customers?per_page=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        // Identify this server-to-server integration to upstream security filters.
        "User-Agent": "SyrianFatora-MCP/0.1 (+https://bytebalancetech.com)",
      },
      redirect: "manual",
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new CredentialValidationError(
      "upstream_unavailable",
      "SyrianFatora could not be reached securely. Please try again later.",
      503,
    );
  }

  if (response.status === 200) return true;

  if (response.status === 401) {
    throw new CredentialValidationError(
      "invalid_key",
      "The API key was rejected. Check it in SyrianFatora and try again.",
      400,
    );
  }

  if (response.status === 403) {
    // Cloudflare and other upstream security layers can also return 403.
    // Do not misreport those infrastructure denials as missing API scopes.
    let upstreamError;
    try {
      const body = await response.clone().json();
      upstreamError = body?.error_name || body?.error_code;
    } catch {
      // A non-JSON 403 is treated as an API permission denial below.
    }

    if (upstreamError === "browser_signature_banned" || upstreamError === 1010) {
      throw new CredentialValidationError(
        "upstream_access_blocked",
        "SyrianFatora's security layer blocked the server-to-server validation request. Contact the SyrianFatora site owner to allow this integration.",
        503,
      );
    }

    throw new CredentialValidationError(
      "missing_permission",
      "The key is valid but needs the customers.read permission, and API access must be enabled for its workspace.",
      400,
    );
  }

  if (response.status === 429) {
    throw new CredentialValidationError(
      "rate_limited",
      "SyrianFatora rate-limited the validation request. Wait before trying again.",
      429,
    );
  }

  throw new CredentialValidationError(
    "upstream_error",
    "SyrianFatora returned an unexpected response. Please try again later.",
    503,
  );
}
