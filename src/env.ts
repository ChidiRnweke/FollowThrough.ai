import { defineEnvVars } from '@sveltejs/kit/hooks';
import { z } from 'zod';

const optionalString = z.string().optional();

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	OPENROUTER_API_KEY: {
		description: 'OpenRouter API key used by workbench chat.',
		schema: optionalString
	},
	OPENROUTER_BASE_URL: {
		description: 'OpenAI-compatible OpenRouter API base URL.',
		schema: optionalString
	},
	OPENROUTER_DEFAULT_MODEL: {
		description: 'Fallback OpenRouter model ID for workbench chat.',
		schema: optionalString
	},
	OPENROUTER_RECOMMENDED_MODELS: {
		description: 'Comma-separated OpenRouter model IDs shown as recommended.',
		schema: optionalString
	},
	OPENAI_AGENT_MODEL: {
		description: 'Deprecated compatibility fallback for OPENROUTER_DEFAULT_MODEL.',
		schema: optionalString
	},
	S3_ENDPOINT: { description: 'S3-compatible object storage endpoint.', schema: optionalString },
	S3_REGION: { description: 'S3 region.', schema: optionalString },
	S3_ACCESS_KEY_ID: { description: 'S3 access key.', schema: optionalString },
	S3_SECRET_ACCESS_KEY: { description: 'S3 secret key.', schema: optionalString },
	S3_BUCKET: { description: 'S3 attachment bucket.', schema: optionalString },
	S3_FORCE_PATH_STYLE: { description: 'Use path-style S3 URLs.', schema: optionalString }
});
