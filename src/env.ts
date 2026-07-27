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
	LOCAL_USER_ID: { description: 'Single-user installation actor UUID.', schema: optionalString },
	ORIGIN: { description: 'Canonical public application origin.', schema: optionalString },
	BODY_SIZE_LIMIT: {
		description: 'Adapter-node request body size limit in bytes.',
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
	RETRIEVAL_CHUNK_TOKENS: {
		description: 'Retrieval chunk target token count.',
		schema: optionalString
	},
	RETRIEVAL_CHUNK_OVERLAP_TOKENS: {
		description: 'Retrieval chunk overlap token count.',
		schema: optionalString
	},
	ATTACHMENT_MAX_BYTES: {
		description: 'Maximum uploaded attachment size.',
		schema: optionalString
	},
	ATTACHMENT_PARSE_MAX_BYTES: {
		description: 'Maximum attachment parser input size.',
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
	OPENROUTER_OCR_MODEL: {
		description:
			'OpenRouter model used for PDF OCR and image description (defaults to google/gemini-2.5-flash-lite).',
		schema: optionalString
	},
	ATTACHMENT_OCR_MAX_PAGES: {
		description: 'Maximum PDF page count processed via OCR (defaults to 100).',
		schema: optionalString
	},
	ATTACHMENT_OCR_ENABLED: {
		description: 'Enable OCR extraction for PDF attachments (defaults to true).',
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
			'OTLP/HTTP collector endpoint for traces (port 4318 on the collector). Telemetry is disabled when unset.',
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
