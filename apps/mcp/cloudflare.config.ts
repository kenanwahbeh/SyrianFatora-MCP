import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "syrianfatora-mcp-oauth-preview",
		compatibilityDate: "2026-11-17",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/index.mjs",
		workersDev: true,
		previews: {},
		observability: {
			enabled: true,
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
			MCP_SERVER_URL: bindings.text("https://replace-with-mcp-preview-host.invalid/mcp"),
			AUTH_SERVER_URL: bindings.text("https://replace-with-auth-preview-host.invalid"),
			RATE_LIMITER: bindings.durableObject({
				worker: "syrianfatora-auth-preview",
				exportName: "CredentialRateLimiter",
			}),
			AUTH_SERVER: bindings.worker({
				worker: "syrianfatora-auth-preview",
				exportName: "SyrianFatoraAuth",
			}),
		},
	},
});
