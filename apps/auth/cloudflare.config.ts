import { bindings, defineConfig, exports } from "cf/config";

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
					? "https://syrianfatora-auth-preview.kinan-api.workers.dev"
					: "https://replace-with-auth-production-host.invalid",
			),
			MCP_SERVER_URL: bindings.text(
				isPreview
					? "https://syrianfatora-mcp-oauth-preview.kinan-api.workers.dev/mcp"
					: "https://replace-with-mcp-production-host.invalid/mcp",
			),
			...(isPreview ? {} : {
				RATE_LIMITER: bindings.durableObject({
					worker: "syrianfatora-auth",
					exportName: "CredentialRateLimiter",
				}),
			}),
			OAUTH_KV: bindings.kv({
				id: isPreview
					? "REPLACE_WITH_PREVIEW_KV_NAMESPACE_ID"
					: "d19d9bd755c349f688cd55e299b8168f",
			}),
		},
	},
}));