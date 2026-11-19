import { bindings, defineConfig } from "cf/config";

const MCP_RESOURCE_URL = "https://syrianfatora-mcp.kinan-api.workers.dev/mcp";
const AUTH_ORIGIN = "https://syrianfatora-auth.kinan-api.workers.dev";

export default defineConfig(({ isPreview }) => ({
	worker: {
		name: isPreview ? "syrianfatora-mcp-oauth-preview" : "syrianfatora-mcp",
		compatibilityDate: "2026-11-17",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint: "src/index.mjs",
		workersDev: true,
		observability: {
			enabled: true,
			redactQueryString: true,
			logs: { enabled: true, invocationLogs: true },
			traces: { enabled: true, headSamplingRate: 1 },
		},
		env: {
			MCP_SERVER_URL: bindings.text(
				isPreview
					? "https://test-durable-object-atomicity-syrianfatora-mcp-oauth-preview.kinan-api.workers.dev/mcp"
					: MCP_RESOURCE_URL,
			),
			AUTH_SERVER_URL: bindings.text(
				isPreview
					? "https://test-durable-object-atomicity-syrianfatora-auth-preview.kinan-api.workers.dev"
					: AUTH_ORIGIN,
			),
			RATE_LIMIT_HMAC_SECRET: bindings.secret(),
			...(isPreview ? {
				RATE_LIMITER: bindings.durableObject({
					worker: "syrianfatora-auth-preview",
					exportName: "CredentialRateLimiter",
				}),
				AUTH_SERVER: bindings.worker({
					worker: "syrianfatora-auth-preview",
					exportName: "SyrianFatoraAuth",
				}),
			} : {
				RATE_LIMITER: bindings.durableObject({
					worker: "syrianfatora-auth",
					exportName: "CredentialRateLimiter",
				}),
				AUTH_SERVER: bindings.worker({
					worker: "syrianfatora-auth",
					exportName: "SyrianFatoraAuth",
				}),
			}),
		},
	},
}));
