import { bindings, defineConfig } from "cf/config";

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
					? "https://syrianfatora-mcp-oauth-preview.kinan-api.workers.dev/mcp"
					: "https://replace-with-mcp-production-host.invalid/mcp",
			),
			AUTH_SERVER_URL: bindings.text(
				isPreview
					? "https://syrianfatora-auth-preview.kinan-api.workers.dev"
					: "https://replace-with-auth-production-host.invalid",
			),
			RATE_LIMIT_HMAC_SECRET: bindings.secret(),
			...(isPreview ? {
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