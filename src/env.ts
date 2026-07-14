import { defineEnvVars } from '@sveltejs/kit/hooks';
import { z } from 'zod';

const optionalString = z.string().optional();

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	OPENROUTER_API_KEY: {
		description: 'OpenRouter API key used by workbench chat.',
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
	}
});
