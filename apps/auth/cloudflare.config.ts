import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "syrianfatora-auth-preview",
		compatibilityDate: "2026-11-17",
		compatibilityFlags: [
			"nodejs_compat",
			"global_fetch_strictly_public",
		],
		entrypoint: "src/index.mjs",
		workersDev: true,
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
			ISSUER: bindings.text("https://replace-with-auth-preview-host.invalid"),
			MCP_SERVER_URL: bindings.text("https://replace-with-mcp-preview-host.invalid/mcp"),
			OAUTH_KV: bindings.kv({
				id: "REPLACE_WITH_PREVIEW_KV_NAMESPACE_ID",
			}),
		},
	},
});
