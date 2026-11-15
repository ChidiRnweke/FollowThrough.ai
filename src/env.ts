// chisel-ignore-file import-boundary:framework-leak -- SvelteKit loads this root environment-schema entry point directly.
import { defineEnvVars } from '@sveltejs/kit/hooks';
import { z } from 'zod';

const optionalString = z.string().optional();

export const variables = defineEnvVars({
	CONFIG_SOURCE: {
		description: 'Configuration backend: infisical (default) or env.',
		schema: optionalString
	},
	INFISICAL_CLIENT_ID: {
		description: 'Universal Auth application client ID.',
		schema: optionalString
	},
	INFISICAL_CLIENT_SECRET: {
		description: 'Universal Auth application client secret.',
		schema: optionalString
	},
	INFISICAL_PROJECT_ID: { description: 'Application secrets project ID.', schema: optionalString },
	INFISICAL_ENVIRONMENT: { description: 'Infisical environment slug.', schema: optionalString },
	INFISICAL_URL: { description: 'Infisical instance URL.', schema: optionalString },
	DATABASE_URL: { description: 'The database connection string.', schema: optionalString },
	DB_NAME: { description: 'Provisioned database name.', schema: optionalString },
	DB_USER: { description: 'Provisioned application role.', schema: optionalString },
	AUTHENTIK_DOMAIN: {
		description: 'Authentik provider URL. Required at runtime.',
		schema: optionalString
	},
	AUTHENTIK_CLIENT_ID: {
		description: 'Authentik OAuth client ID. Required at runtime.',
		schema: optionalString
	},
	AUTHENTIK_CLIENT_SECRET: {
		description: 'Authentik OAuth client secret. Required at runtime.',
		schema: optionalString
	},
	AUTHENTIK_CALLBACK_URL: {
		description: 'Authentik OAuth callback URL. Required at runtime.',
		schema: optionalString
	},
	ORIGIN: { description: 'Canonical public application origin.', schema: optionalString },
	CONNECTOR_SECRET_KEYS: {
		description:
			'Keys that encrypt connector credentials, newest first: <keyId>:<base64 32-byte key>, comma-separated. Without it, connectors are off.',
		schema: optionalString
	},
	CONNECTOR_ASANA_CLIENT_ID: {
		description: 'OAuth client ID registered with Asana, which turns on its connector.',
		schema: optionalString
	},
	CONNECTOR_ASANA_CLIENT_SECRET: {
		description: 'OAuth client secret registered with Asana, beside its client ID.',
		schema: optionalString
	},
	CONNECTOR_BOX_CLIENT_ID: {
		description: 'OAuth client ID registered with Box, which turns on its connector.',
		schema: optionalString
	},
	CONNECTOR_BOX_CLIENT_SECRET: {
		description: 'OAuth client secret registered with Box, beside its client ID.',
		schema: optionalString
	},
	CONNECTOR_GITHUB_CLIENT_ID: {
		description: 'OAuth client ID registered with GitHub, which turns on its connector.',
		schema: optionalString
	},
	CONNECTOR_GITHUB_CLIENT_SECRET: {
		description: 'OAuth client secret registered with GitHub, beside its client ID.',
		schema: optionalString
	},
	CONNECTOR_HUBSPOT_CLIENT_ID: {
		description: 'OAuth client ID registered with HubSpot, which turns on its connector.',
		schema: optionalString
	},
	CONNECTOR_HUBSPOT_CLIENT_SECRET: {
		description: 'OAuth client secret registered with HubSpot, beside its client ID.',
		schema: optionalString
	},
	CONNECTOR_PAGERDUTY_CLIENT_ID: {
		description: 'OAuth client ID registered with PagerDuty, which turns on its connector.',
		schema: optionalString
	},
	CONNECTOR_PAGERDUTY_CLIENT_SECRET: {
		description: 'OAuth client secret registered with PagerDuty, beside its client ID.',
		schema: optionalString
	},
	CONNECTOR_RENDER_CLIENT_ID: {
		description: 'OAuth client ID registered with Render, which turns on its connector.',
		schema: optionalString
	},
	CONNECTOR_RENDER_CLIENT_SECRET: {
		description: 'OAuth client secret registered with Render, beside its client ID.',
		schema: optionalString
	},
	CONNECTOR_SLACK_CLIENT_ID: {
		description: 'OAuth client ID registered with Slack, which turns on its connector.',
		schema: optionalString
	},
	CONNECTOR_SLACK_CLIENT_SECRET: {
		description: 'OAuth client secret registered with Slack, beside its client ID.',
		schema: optionalString
	},
	BODY_SIZE_LIMIT: {
		description:
			'Adapter-node request body size limit in bytes. A platform key: the adapter reads it ' +
			'at module load, so it must be in the process environment before the server starts and ' +
			'can never be hydrated from the secrets backend.',
		schema: optionalString
	},
	ATTACHMENT_RESERVATION_MAX_BYTES: {
		description: 'Largest attachment upload admitted, in bytes. Unset admits any size.',
		schema: optionalString
	},
	ARCHIVE_MAX_EXPANDED_BYTES: {
		description: 'Archive decompression admission in bytes (defaults to 26214400).',
		schema: optionalString
	},
	ARCHIVE_MAX_ENTRIES: {
		description: 'Archive entry admission (defaults to 2000).',
		schema: optionalString
	},
	CLIENT_ERROR_MAX_BODY_BYTES: {
		description: 'Largest browser error report body in bytes (defaults to 66560).',
		schema: optionalString
	},
	CLIENT_ERROR_REPORTS_PER_WINDOW: {
		description: 'Browser error reports one user may send per window (defaults to 20).',
		schema: optionalString
	},
	CLIENT_ERROR_WINDOW_SECONDS: {
		description:
			'Window in seconds for the browser error report budget and repeat suppression (defaults to 60).',
		schema: optionalString
	},
	OAUTH_REGISTRATION_MAX_BODY_BYTES: {
		description: 'Largest OAuth client registration body in bytes (defaults to 491520).',
		schema: optionalString
	},
	OAUTH_TOKEN_MAX_BODY_BYTES: {
		description: 'Largest OAuth token request body in bytes (defaults to 221184).',
		schema: optionalString
	},
	AUTHENTIK_REQUEST_TIMEOUT_MS: {
		description: 'Deadline for each Authentik token or profile request (defaults to 10000).',
		schema: optionalString
	},
	MCP_CLIENT_UNUSED_RETENTION_MS: {
		description:
			'How long an anonymous MCP client registration may go without a code before the worker deletes it (defaults to 86400000).',
		schema: optionalString
	},
	MCP_CLIENT_SWEEP_INTERVAL_MS: {
		description:
			'How often the worker deletes unused MCP client registrations (defaults to 900000).',
		schema: optionalString
	},
	TEMPLATE_MAX_BYTES: {
		description: 'Uploaded DOCX template size admission in bytes (defaults to 26214400).',
		schema: optionalString
	},
	TEMPLATE_MAX_EXPANDED_BYTES: {
		description: 'DOCX template decompression admission in bytes (defaults to 26214400).',
		schema: optionalString
	},
	TEMPLATE_MAX_ENTRIES: {
		description: 'DOCX template entry admission (defaults to 2000).',
		schema: optionalString
	},
	CONNECTOR_OPERATION_TIMEOUT_MS: {
		description:
			'Total milliseconds one connector operation may take: listing tools, signing in or ' +
			'fetching an icon (defaults to 60000).',
		schema: optionalString
	},
	AGENT_TRACE_CONTENT: {
		description:
			'Whether agent traces carry prompts, answers and tool payloads: true (default) or false.',
		schema: optionalString
	},
	AGENT_MAX_ACTIVE_RUNS_PER_USER: {
		description:
			'Chat runs one account may have executing at once (defaults to 5, a starting value to tune).',
		schema: optionalString
	},
	AGENT_MAX_ACTIVE_RUNS: {
		description:
			'Chat runs the deployment may have executing at once (defaults to 50, a starting value to tune).',
		schema: optionalString
	},
	OPENROUTER_API_KEY: {
		description: 'OpenRouter API key used by workbench chat.',
		schema: optionalString
	},
	OPENROUTER_BASE_URL: {
		description: 'OpenAI-compatible OpenRouter API base URL.',
		schema: optionalString
	},
	OPENROUTER_DEFAULT_MODEL: {
		description: 'Default OpenRouter generation model ID (defaults to deepseek/deepseek-v4-flash).',
		schema: optionalString
	},
	OPENROUTER_RECOMMENDED_MODELS: {
		description: 'Comma-separated OpenRouter model IDs shown as recommended.',
		schema: optionalString
	},
	OPENROUTER_INLINE_MODEL: { description: 'Inline completion model ID.', schema: optionalString },
	OPENROUTER_INLINE_COMPLETION_MODEL: {
		description: 'Optional inline completion model override.',
		schema: optionalString
	},
	OPENROUTER_WEB_SEARCH_ENGINE: {
		description:
			'Default web search engine: auto | native | exa | firecrawl | parallel | perplexity.',
		schema: optionalString
	},
	OPENROUTER_WEB_SEARCH_MAX_RESULTS: {
		description: 'Default result cap for a single web search.',
		schema: optionalString
	},
	OPENROUTER_WEB_SEARCH_MAX_TOTAL_RESULTS: {
		description: 'Default result cap across every web search in one run.',
		schema: optionalString
	},
	RETRIEVAL_CHUNK_TOKENS: {
		description: 'Retrieval chunk target token count.',
		schema: optionalString
	},
	RETRIEVAL_CHUNK_OVERLAP_TOKENS: {
		description: 'Retrieval chunk overlap token count.',
		schema: optionalString
	},
	S3_ENDPOINT: { description: 'S3-compatible object storage endpoint.', schema: optionalString },
	S3_REGION: { description: 'S3 region.', schema: optionalString },
	S3_ACCESS_KEY_ID: { description: 'S3 access key.', schema: optionalString },
	S3_SECRET_ACCESS_KEY: { description: 'S3 secret key.', schema: optionalString },
	S3_BUCKET: { description: 'S3 attachment bucket.', schema: optionalString },
	OPENROUTER_ATTACHMENT_VISION_MODEL: {
		description: 'OpenRouter model used to describe uploaded images.',
		schema: optionalString
	},
	MISTRAL_API_KEY: {
		description: 'Mistral API key for Document AI OCR. Required to process attachments.',
		schema: optionalString
	},
	MISTRAL_BASE_URL: {
		description: 'Mistral API base URL (defaults to https://api.mistral.ai/v1).',
		schema: optionalString
	},
	MISTRAL_OCR_MODEL: {
		description: 'Mistral Document AI OCR model (defaults to mistral-ocr-latest).',
		schema: optionalString
	},
	S3_FORCE_PATH_STYLE: { description: 'Use path-style S3 URLs.', schema: optionalString },
	EVAL_RECORD: { description: 'Record live eval cache responses.', schema: optionalString },
	EVAL_STRICT_CACHE: { description: 'Fail evals on cache misses.', schema: optionalString },
	EVAL_MODEL: { description: 'Eval generation model override.', schema: optionalString },
	EVAL_JUDGE_MODEL: { description: 'Eval judge model override.', schema: optionalString },
	EVAL_GATE: { description: 'Enable eval acceptance gating.', schema: optionalString },
	OTEL_EXPORTER_OTLP_ENDPOINT: {
		description:
			'OTLP/gRPC collector endpoint, port 4317 — used as-is for both traces and logs. ' +
			'Telemetry is disabled when unset. Deployment-supplied only: OTEL_* and PHOENIX_* are platform ' +
			'keys, which `isPlatformKey` in server/config.ts excludes from hydration, so a value set in the ' +
			'secrets backend is never read. Set it in docker-compose.prod.yml (prod) or .env (dev).',
		schema: optionalString
	},
	PHOENIX_PROJECT_NAME: {
		description: 'Phoenix project name traces are grouped under (defaults to followthrough).',
		schema: optionalString
	},
	PHOENIX_API_KEY: {
		description: 'Optional auth token forwarded to the Phoenix OTLP collector.',
		schema: optionalString
	}
});
