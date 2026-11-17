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
      },
      redirect: "error",
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
