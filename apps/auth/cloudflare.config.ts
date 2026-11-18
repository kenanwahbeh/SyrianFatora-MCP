import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
	worker: {
		name: "syrianfatora-auth-preview",
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
			ISSUER: bindings.text("https://replace-with-auth-preview-host.invalid"),
			MCP_SERVER_URL: bindings.text("https://replace-with-mcp-preview-host.invalid/mcp"),
			RATE_LIMITER: bindings.durableObject({
				worker: "syrianfatora-auth-preview",
				exportName: "CredentialRateLimiter",
			}),
			OAUTH_KV: bindings.kv({
				id: "REPLACE_WITH_PREVIEW_KV_NAMESPACE_ID",
			}),
		},
	},
});
