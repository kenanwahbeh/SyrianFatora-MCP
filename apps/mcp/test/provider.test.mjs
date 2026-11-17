import test from "node:test";
import assert from "node:assert/strict";
import { OAuthResourceServer } from "@cloudflare/workers-oauth-provider";

test("pinned Workers OAuth Provider exposes the split resource-server API", () => {
  const server = new OAuthResourceServer({
    resourceMetadata: {
      resource: "https://mcp.example.test/mcp",
      authorization_servers: ["https://auth.example.test"],
    },
    requiredScopes: ["mcp:read"],
    validateToken: (workerEnv) => workerEnv.AUTH_SERVER.validateToken,
    handler: {
      fetch: () => new Response("ok"),
    },
  });

  assert.equal(typeof server.fetch, "function");
});
