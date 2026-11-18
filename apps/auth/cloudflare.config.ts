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
					? "https://oauth-upstream-client-identification-syrianfatora-auth-preview.kinan-api.workers.dev"
					: "https://replace-with-auth-production-host.invalid",
			),
			MCP_SERVER_URL: bindings.text(
				isPreview
					? "https://oauth-upstream-client-identification-syrianfatora-mcp-oauth-preview.kinan-api.workers.dev/mcp"
					: "https://replace-with-mcp-production-host.invalid/mcp",
			),
			ACCESS_TOKEN_TTL_SECONDS: bindings.text("3600"),
			REFRESH_TOKEN_TTL_SECONDS: bindings.text("2592000"),
			CLIENT_REGISTRATION_TTL_SECONDS: bindings.text("7776000"),
			...(isPreview ? {
				// Isolated Preview-only test thresholds; these are not Production quotas.
				RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS: bindings.text("7"),
				RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: bindings.text("60"),
				RATE_LIMIT_AUTH_CREDENTIAL_MAX_ATTEMPTS: bindings.text("2"),
				RATE_LIMIT_AUTH_CREDENTIAL_WINDOW_SECONDS: bindings.text("60"),
				RATE_LIMIT_CREDENTIAL_MAX_REQUESTS: bindings.text("10"),
				RATE_LIMIT_CREDENTIAL_WINDOW_SECONDS: bindings.text("60"),
				RATE_LIMIT_GRANT_MAX_REQUESTS: bindings.text("5"),
				RATE_LIMIT_GRANT_WINDOW_SECONDS: bindings.text("60"),
				RATE_LIMIT_UPSTREAM_429_COOLDOWN_SECONDS: bindings.text("30"),
			} : {}),
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
