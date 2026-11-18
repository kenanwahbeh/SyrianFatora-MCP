import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ isPreview }) => ({
	worker: {
		name: isPreview ? "syrianfatora-mcp-oauth-preview" : "syrianfatora-mcp",
		compatibilityDate: "2026-11-17",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/index.mjs",
		workersDev: true,
		observability: {
			enabled: true,
			redactQueryString: true,
			logs: {
				enabled: true,
				invocationLogs: true,
			},
			traces: {
				enabled: true,
				headSamplingRate: 1,
			},
		},
		env: {
			MCP_SERVER_URL: bindings.text(
				isPreview
					? "https://replace-with-mcp-preview-host.invalid/mcp"
					: "https://replace-with-mcp-production-host.invalid/mcp",
			),
			AUTH_SERVER_URL: bindings.text(
				isPreview
					? "https://replace-with-auth-preview-host.invalid"
					: "https://replace-with-auth-production-host.invalid",
			),
			...(isPreview ? {} : {
				RATE_LIMITER: bindings.durableObject({
					worker: "syrianfatora-auth",
					exportName: "CredentialRateLimiter",
				}),
			}),
			...(isPreview ? {} : {
				AUTH_SERVER: bindings.worker({
					worker: "syrianfatora-auth",
					exportName: "SyrianFatoraAuth",
				}),
			}),
		},
	},
}));
