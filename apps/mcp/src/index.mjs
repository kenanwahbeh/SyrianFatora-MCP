import {
  OAuthResourceServer,
  insufficientScope,
} from "@cloudflare/workers-oauth-provider";
import { env } from "cloudflare:workers";
import { handleMcpRequest } from "./handler.mjs";

const resourceServer = new OAuthResourceServer({
  resourceMetadata: {
    resource: env.MCP_SERVER_URL,
    authorization_servers: [env.AUTH_SERVER_URL],
  },
  // Advertised to clients; enforced explicitly in the handler below.
  requiredScopes: ["mcp:read"],
  validateToken: (workerEnv) => workerEnv.AUTH_SERVER.validateToken,
  handler: {
    fetch(request, workerEnv, ctx) {
      if (!ctx.auth.scope.includes("mcp:read")) {
        return insufficientScope(ctx.auth, ["mcp:read"]);
      }

      return handleMcpRequest(request, ctx.props, {
        requireWriteScope: () => ctx.auth.scope.includes("mcp:write")
          ? null
          : insufficientScope(ctx.auth, ["mcp:read", "mcp:write"]),
      });
    },
  },
});

function addCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type, authorization, mcp-protocol-version, accept");
  headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Protocol-Version");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, workerEnv, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return addCors(Response.json({
        ok: true,
        service: "syrianfatora-mcp",
        mode: "oauth-resource-server",
        toolCount: 51,
      }));
    }

    if (request.method === "OPTIONS") {
      return addCors(new Response(null, { status: 204 }));
    }

    return addCors(await resourceServer.fetch(request, workerEnv, ctx));
  },
};
