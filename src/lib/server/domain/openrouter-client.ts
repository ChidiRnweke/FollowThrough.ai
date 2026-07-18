import OpenAI from 'openai';

/**
 * Shared construction for the OpenAI SDK pointed at OpenRouter. Every AI call in
 * the app runs through OpenRouter on a single key; this centralises the base URL,
 * attribution headers, and the one default generation model so there is no
 * per-call fallback chain that hides which model actually ran.
 */

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** The single default generation/chat model. Not the embedding model. */
export const DEFAULT_GENERATION_MODEL = 'deepseek/deepseek-v4-flash';

export interface OpenRouterClientOptions {
	readonly baseURL?: string;
	readonly appURL?: string;
}

export const createOpenRouterClient = (
	apiKey: string,
	options: OpenRouterClientOptions = {}
): OpenAI =>
	new OpenAI({
		apiKey,
		baseURL: options.baseURL ?? DEFAULT_OPENROUTER_BASE_URL,
		defaultHeaders: {
			'HTTP-Referer': options.appURL ?? 'http://localhost:5173',
			'X-OpenRouter-Title': 'FollowThrough'
		}
	});
