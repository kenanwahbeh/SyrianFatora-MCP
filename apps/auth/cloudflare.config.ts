import { bindings, defineConfig, exports } from "cf/config";

const AUTH_ORIGIN = "https://syrianfatora-auth.kinan-api.workers.dev";
const MCP_RESOURCE_URL = "https://syrianfatora-mcp.kinan-api.workers.dev/mcp";

export default defineConfig(({ isPreview }) => ({
	worker: {
		name: isPreview ? "syrianfatora-auth-preview" : "syrianfatora-auth",
		compatibilityDate: "2026-11-17",
		compatibilityFlags: [
			"nodejs_compat",
			"global_fetch_strictly_public",
		],
		entrypoint: "src/index.mjs",
		exports: {
			CredentialRateLimiter: exports.durableObject({ storage: "sqlite" }),
		},
		workersDev: true,
		observability: {
			enabled: true,
			redactQueryString: true,
			logs: { enabled: true, invocationLogs: true },
			traces: { enabled: true, headSamplingRate: 1 },
		},
		env: {
			ISSUER: bindings.text(
				isPreview
					? "https://test-durable-object-atomicity-syrianfatora-auth-preview.kinan-api.workers.dev"
					: AUTH_ORIGIN,
			),
			MCP_SERVER_URL: bindings.text(
				isPreview
					? "https://test-durable-object-atomicity-syrianfatora-mcp-oauth-preview.kinan-api.workers.dev/mcp"
					: MCP_RESOURCE_URL,
			),
			ACCESS_TOKEN_TTL_SECONDS: bindings.text("3600"),
			REFRESH_TOKEN_TTL_SECONDS: bindings.text("2592000"),
			CLIENT_REGISTRATION_TTL_SECONDS: bindings.text("7776000"),
			// Authorization-attempt abuse protection; these values do not meter MCP usage.
			RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS: bindings.text("7"),
			RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: bindings.text("60"),
			RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS: bindings.text("2"),
			RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS: bindings.text("60"),
			RATE_LIMITER: bindings.durableObject({
				worker: isPreview
					? "syrianfatora-auth-preview"
					: "syrianfatora-auth",
				exportName: "CredentialRateLimiter",
			}),
			OAUTH_KV: bindings.kv({
				id: isPreview
					? "6565df7797504ac882ef39c009626866"
					: "d19d9bd755c349f688cd55e299b8168f",
			}),
			RATE_LIMIT_HMAC_SECRET: bindings.secret(),
		},
	},
}));
