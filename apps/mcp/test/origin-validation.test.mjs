import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedMcpOrigin } from "../src/origin-validation.mjs";

function request(origin, url = "https://mcp.example.test/mcp") {
  const headers = origin === undefined ? {} : { Origin: origin };
  return new Request(url, { method: "POST", headers });
}

test("allows requests without Origin for non-browser MCP clients", () => {
  assert.equal(isAllowedMcpOrigin(request()), true);
});

test("allows same-origin browser requests", () => {
  assert.equal(isAllowedMcpOrigin(request("https://mcp.example.test")), true);
});

test("allows explicitly configured browser origins", () => {
  assert.equal(isAllowedMcpOrigin(
    request("https://chat.example.test"),
    { MCP_ALLOWED_ORIGINS: "https://chat.example.test, https://other.example.test" },
  ), true);
});

test("rejects unconfigured, malformed, opaque and non-canonical origins", () => {
  assert.equal(isAllowedMcpOrigin(request("https://evil.example.test")), false);
  assert.equal(isAllowedMcpOrigin(request("null")), false);
  assert.equal(isAllowedMcpOrigin(request("https://chat.example.test/path"), {
    MCP_ALLOWED_ORIGINS: "https://chat.example.test/path",
  }), false);
  assert.equal(isAllowedMcpOrigin(request("not an origin")), false);
});

test("rejects non-loopback HTTP origins even when explicitly configured", () => {
  assert.equal(isAllowedMcpOrigin(
    request("http://chat.example.test"),
    { MCP_ALLOWED_ORIGINS: "http://chat.example.test" },
  ), false);
});

test("allows explicitly configured loopback HTTP origins for local development", () => {
  assert.equal(isAllowedMcpOrigin(
    request("http://localhost:3000"),
    { MCP_ALLOWED_ORIGINS: "http://localhost:3000" },
  ), true);
});
