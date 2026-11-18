import { OAuthResourceServer } from "@cloudflare/workers-oauth-provider";

const resourceServer = new OAuthResourceServer({
  resourceMetadata: {
    resource: "https://mcp.example.test/mcp",
    authorization_servers: ["http://localhost:8787"],
  },
  requiredScopes: ["mcp:read"],
  validateToken: (env) => env.AUTH_SERVER.validateToken,
  handler: {
    async fetch(_request, _env, ctx) {
      return Response.json({
        ok: true,
        props: ctx.props,
        auth: {
          token: ctx.auth.token,
          audience: ctx.auth.audience,
          expiresAt: ctx.auth.expiresAt,
          scope: ctx.auth.scope,
          userId: ctx.auth.userId,
          clientId: ctx.auth.clientId,
        },
      });
    },
  },
});

export default resourceServer;
