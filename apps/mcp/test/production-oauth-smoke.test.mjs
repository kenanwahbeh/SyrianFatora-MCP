import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const smokeScript = fileURLToPath(new URL("../../../scripts/production-oauth-smoke.mjs", import.meta.url));

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function json(response, value, status = 200, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function waitForAuthorizationUrl(child, authOrigin, getOutput) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const check = () => {
      if (settled) return;
      const line = getOutput().split(/\r?\n/).find((item) => item.startsWith(`${authOrigin}/authorize?`));
      if (line) {
        settled = true;
        resolve(new URL(line.trim()));
      }
    };
    child.stdout.on("data", check);
    child.once("error", (error) => {
      if (!settled) reject(error);
    });
    child.once("exit", (code) => {
      if (!settled) reject(new Error(`Smoke process exited before OAuth URL was printed (code ${code})`));
    });
    check();
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

test("authenticated production smoke exercises OAuth PKCE and a read-only MCP tool using local mocks", { timeout: 20_000 }, async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "syrianfatora-smoke-test-"));
  const cachePath = path.join(tempDir, "client.json");
  const callbackProbe = createServer();
  const callbackPort = await listen(callbackProbe);
  await close(callbackProbe);

  const authErrors = [];
  const mcpErrors = [];
  let registrationCount = 0;
  let authorization;
  const mcpCalls = [];

  const authServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST" && url.pathname === "/oauth/register") {
        const body = JSON.parse(await requestBody(request));
        assert.equal(body.token_endpoint_auth_method, "none");
        assert.equal(body.redirect_uris.length, 1);
        registrationCount += 1;
        json(response, { client_id: "local-smoke-public-client" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/authorize") {
        const params = url.searchParams;
        assert.equal(params.get("response_type"), "code");
        assert.equal(params.get("client_id"), "local-smoke-public-client");
        assert.equal(params.get("scope"), "mcp:read");
        assert.equal(params.get("code_challenge_method"), "S256");
        assert.equal(params.get("resource"), `${mcpOrigin}/mcp`);
        authorization = {
          clientId: params.get("client_id"),
          redirectUri: params.get("redirect_uri"),
          state: params.get("state"),
          challenge: params.get("code_challenge"),
        };
        const callback = new URL(authorization.redirectUri);
        callback.searchParams.set("code", "local-smoke-authorization-code");
        callback.searchParams.set("state", authorization.state);
        response.writeHead(302, { Location: callback.toString(), "Cache-Control": "no-store" });
        response.end();
        return;
      }

      if (request.method === "POST" && url.pathname === "/oauth/token") {
        const form = new URLSearchParams(await requestBody(request));
        assert.equal(form.get("grant_type"), "authorization_code");
        assert.equal(form.get("code"), "local-smoke-authorization-code");
        assert.equal(form.get("client_id"), authorization?.clientId);
        assert.equal(form.get("redirect_uri"), authorization?.redirectUri);
        assert.equal(form.get("resource"), `${mcpOrigin}/mcp`);
        const actualChallenge = createHash("sha256").update(form.get("code_verifier")).digest("base64url");
        assert.equal(actualChallenge, authorization?.challenge, "PKCE verifier must match the S256 challenge");
        json(response, {
          access_token: "synthetic-local-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "mcp:read",
        });
        return;
      }

      response.writeHead(404);
      response.end();
    } catch (error) {
      authErrors.push(error);
      json(response, { error: "mock_auth_failure" }, 500);
    }
  });

  const mcpServer = createServer(async (request, response) => {
    try {
      assert.equal(request.method, "POST");
      assert.equal(new URL(request.url ?? "/", "http://127.0.0.1").pathname, "/mcp");
      assert.equal(request.headers.authorization, "Bearer synthetic-local-access-token");
      const message = JSON.parse(await requestBody(request));
      mcpCalls.push({ method: message.method, params: message.params, sessionId: request.headers["mcp-session-id"] });
      const headers = { "MCP-Session-Id": "local-smoke-session" };

      if (message.method === "initialize") {
        json(response, {
          jsonrpc: "2.0",
          id: message.id,
          result: { serverInfo: { name: "syrianfatora-mcp", version: "test" } },
        }, 200, headers);
        return;
      }

      if (message.method === "notifications/initialized") {
        response.writeHead(202, { "Cache-Control": "no-store" });
        response.end();
        return;
      }

      if (message.method === "tools/list") {
        assert.equal(request.headers["mcp-session-id"], "local-smoke-session");
        const tools = Array.from({ length: 51 }, (_, index) => ({
          name: index === 0 ? "customers_list" : `synthetic_tool_${index}`,
        }));
        json(response, { jsonrpc: "2.0", id: message.id, result: { tools } }, 200, headers);
        return;
      }

      if (message.method === "tools/call") {
        assert.equal(request.headers["mcp-session-id"], "local-smoke-session");
        assert.equal(message.params?.name, "customers_list");
        assert.deepEqual(message.params?.arguments, { query: { per_page: 1 } });
        json(response, {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ status: 200, data: { data: [] } }) }],
          },
        }, 200, headers);
        return;
      }

      throw new Error(`Unexpected MCP method: ${message.method}`);
    } catch (error) {
      mcpErrors.push(error);
      json(response, { error: "mock_mcp_failure" }, 500);
    }
  });

  const authPort = await listen(authServer);
  const mcpPort = await listen(mcpServer);
  const authOrigin = `http://127.0.0.1:${authPort}`;
  const mcpOrigin = `http://127.0.0.1:${mcpPort}`;

  t.after(async () => {
    await Promise.all([close(authServer), close(mcpServer)]);
    await rm(tempDir, { recursive: true, force: true });
  });

  async function runSmokeOnce() {
    let stdout = "";
    let stderr = "";
    const child = spawn(process.execPath, [smokeScript], {
      cwd: path.dirname(smokeScript),
      env: {
        ...process.env,
        AUTH_ORIGIN: authOrigin,
        MCP_ORIGIN: mcpOrigin,
        SMOKE_CALLBACK_PORT: String(callbackPort),
        SMOKE_CLIENT_CACHE: cachePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const exit = waitForExit(child);

    try {
      const authorizationUrl = await waitForAuthorizationUrl(child, authOrigin, () => stdout);
      const callback = await fetch(authorizationUrl);
      assert.equal(callback.status, 200);
      assert.match(await callback.text(), /Authorization received/);
      const result = await exit;
      assert.equal(result.code, 0, `smoke script failed: ${stderr}\n${stdout}`);
      assert.match(stdout, /PASS: real OAuth session and read-only MCP tool call verified\./);
      return stdout;
    } catch (error) {
      child.kill("SIGTERM");
      throw error;
    }
  }

  const firstRun = await runSmokeOnce();
  assert.match(firstRun, /OAuth test client registered and cached\./);
  const secondRun = await runSmokeOnce();
  assert.match(secondRun, /OAuth test client reused from local cache\./);

  assert.equal(registrationCount, 1, "valid client cache should prevent duplicate OAuth client registrations");
  assert.deepEqual(authErrors, []);
  assert.deepEqual(mcpErrors, []);
  assert.equal(mcpCalls.filter((call) => call.method === "tools/call").length, 2);
  assert.equal(mcpCalls.filter((call) => call.method === "tools/list").length, 2);
  assert.ok(mcpCalls.every((call) => call.method === "initialize" || call.sessionId === "local-smoke-session"));
});
