import {
  AuthorizationError,
  OAuthAuthorizationServer,
} from "@cloudflare/workers-oauth-provider";
import { WorkerEntrypoint, env } from "cloudflare:workers";
import { enforceAuthorizationAbuseProtection, AuthorizationAbuseError } from "./rate-limit-client.mjs";
import {
  CredentialValidationError,
  escapeHtml,
  renderConsentScopes,
  validateConsentScopes,
  validateSyrianFatoraKey,
  readUrlEncodedForm,
} from "./security.mjs";

const SUPPORTED_SCOPES = ["mcp:read", "mcp:write", "offline_access"];

const authorizationServer = new OAuthAuthorizationServer({
  issuer: env.ISSUER,
  resources: [env.MCP_SERVER_URL],
  scopesSupported: SUPPORTED_SCOPES,
  clientIdMetadataDocumentEnabled: true,
  clientRegistrationEndpoint: "/oauth/register",
  accessTokenTTL: Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 3600),
  refreshTokenTTL: Number(env.REFRESH_TOKEN_TTL_SECONDS ?? 2592000),
  clientRegistrationTTL: Number(env.CLIENT_REGISTRATION_TTL_SECONDS ?? 7776000),
});

function securityHeaders(headers = new Headers()) {
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  return headers;
}

function errorPage(message) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SyrianFatora connection</title></head>
<body>
  <main>
    <h1>Could not connect SyrianFatora</h1>
    <p>${escapeHtml(message)}</p>
    <p>Return to ChatGPT and start the connection again. Your API key was not saved by this page.</p>
  </main>
</body>
</html>`;
}

function authorizationPage(details, handle, errorMessage = "") {
  const clientName = escapeHtml(details.clientName);
  const clientDomain = details.clientDomain
    ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : "This app registered itself; its publisher domain is not verified.";
  const scopes = renderConsentScopes(details.scope);
  const localWarning = details.redirectIsLoopback
    ? "<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started signing in from it.</p>"
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect SyrianFatora — ${clientName}</title>
</head>
<body>
  <main>
    <h1>Connect your SyrianFatora workspace</h1>
    ${errorMessage ? `<p role="alert">${escapeHtml(errorMessage)}</p>` : ""}
    <p>Client: <strong>${clientName}</strong>. ${clientDomain}</p>
    <p>OAuth access will be sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
    ${localWarning}
    <h2>SyrianFatora API key</h2>
    <p>Paste your workspace API key. It is checked using a read-only request and kept server-side. It is never sent to ChatGPT.</p>
    <form method="post" action="/authorize">
      <input type="hidden" name="handle" value="${escapeHtml(handle)}">
      <label for="api_key">Workspace API key</label>
      <input id="api_key" name="api_key" type="password" required minlength="20" maxlength="512" autocomplete="off" spellcheck="false" autocapitalize="none">
      <h2>Requested permissions</h2>
      <p>Read access is required. Write access and offline access are optional; select only what you need.</p>
      ${scopes}
      <p><button type="submit" name="decision" value="approve">Connect and allow</button>
      <button type="submit" name="decision" value="deny" formnovalidate>Deny</button></p>
    </form>
  </main>
</body>
</html>`;
}

async function authorize(request, workerEnv) {
  const oauth = authorizationServer.getOAuthApi(workerEnv);

  if (request.method === "GET") {
    const authRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);
    const headers = securityHeaders(consent.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(authorizationPage(details, consent.handle), { headers });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: securityHeaders(new Headers({ Allow: "GET, POST" })),
    });
  }

  const form = await readUrlEncodedForm(request);
  const handle = String(form.get("handle") ?? "");

  if (form.get("decision") !== "approve") {
    const denied = await oauth.denyConsent(request, handle);
    const headers = securityHeaders(denied.headers);
    return new Response(null, { status: 302, headers });
  }

  // Validate the user's scope selection before consuming the one-time handle.
  // Credential checks run only after the browser-bound transaction is verified;
  // if they fail, a fresh bound handle is issued so the user can safely retry.
  const selectedScopes = validateConsentScopes(
    form.getAll("scope").map(String),
    SUPPORTED_SCOPES,
  );

  // Consume and validate the browser-bound consent transaction before making
  // any outbound request. A forged, expired, replayed, or cross-browser handle
  // must never trigger upstream credential validation.
  const approved = await oauth.approveConsent(request, handle, {
    scope: selectedScopes,
  });

  const apiKey = String(form.get("api_key") ?? "").trim();
  try {
    await enforceAuthorizationAbuseProtection(request, apiKey, workerEnv);
    await validateSyrianFatoraKey(apiKey);
  } catch (error) {
    if (!(error instanceof AuthorizationAbuseError) && !(error instanceof CredentialValidationError)) {
      throw error;
    }

    // approveConsent() has securely consumed the previous one-time handle. If
    // validation fails, issue a fresh browser-bound handle for the same already
    // validated OAuth request so the user can correct the key without restarting.
    const details = await oauth.describeConsent(approved.request);
    const retry = await oauth.beginConsent(approved.request);
    const message = error instanceof AuthorizationAbuseError
      ? (error.status === 429
        ? "Too many authorization attempts. Wait before trying again."
        : "Authorization is temporarily unavailable. Please try again later.")
      : error.message;
    const headers = securityHeaders(retry.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    if (error.retryAfterSeconds) headers.set("Retry-After", String(error.retryAfterSeconds));
    return new Response(authorizationPage(details, retry.handle, message), {
      status: error.status ?? 400,
      headers,
    });
  }

  // The provider encrypts props at rest and returns them only to the resource server.
  // This random subject identifies this grant; it is not an upstream account identifier.
  const grantSubject = crypto.randomUUID();
  const { redirectTo } = await oauth.completeAuthorization({
    request: approved.request,
    userId: grantSubject,
    metadata: {},
    scope: approved.request.scope,
    props: {
      grantSubject,
      provider: "syrianfatora",
      upstreamApiKey: apiKey,
    },
  });

  const headers = securityHeaders(approved.headers);
  headers.set("Location", redirectTo);
  return new Response(null, { status: 302, headers });
}

export class SyrianFatoraAuth extends WorkerEntrypoint {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json(
        { ok: true, service: "syrianfatora-auth", version: "0.1.0" },
        { headers: securityHeaders() },
      );
    }

    if (url.pathname !== "/authorize") {
      return authorizationServer.fetch(request, this.env, this.ctx);
    }

    try {
      return await authorize(request, this.env);
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) {
        return Response.redirect(error.redirectTo, 302);
      }

      if (error instanceof AuthorizationError) {
        return new Response(escapeHtml(error.description), {
          status: 400,
          headers: securityHeaders(new Headers({
            "Content-Type": "text/plain; charset=utf-8",
          })),
        });
      }

      if (error instanceof AuthorizationAbuseError) {
        const headers = securityHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" }));
        if (error.retryAfterSeconds) headers.set("Retry-After", String(error.retryAfterSeconds));
        return new Response(
          error.status === 429
            ? "Too many authorization attempts. Wait before trying again."
            : "Authorization is temporarily unavailable. Please try again later.",
          { status: error.status, headers },
        );
      }

      if (error instanceof CredentialValidationError) {
        return new Response(errorPage(error.message), {
          status: error.status,
          headers: securityHeaders(new Headers({
            "Content-Type": "text/html; charset=utf-8",
          })),
        });
      }

      // Do not log request bodies, Authorization headers, or exception objects:
      // they may contain credentials in future integrations.
      return new Response("Internal Server Error", {
        status: 500,
        headers: securityHeaders(),
      });
    }
  }

  validateToken(resource, token) {
    return authorizationServer.validateToken(resource, token, this.env);
  }
}


export { CredentialRateLimiter } from "./rate-limit.mjs";

export default SyrianFatoraAuth;
