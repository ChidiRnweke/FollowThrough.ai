import OpenAI from 'openai';
import type { RerankEndpoint } from '$lib/models/knowledge-search';

export interface RetrievalProviderConfiguration {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
	readonly fetch?: typeof globalThis.fetch;
}

/** The OpenAI-compatible client and rerank endpoint behind knowledge retrieval and tool search. */
export interface RetrievalProvider {
	readonly client: OpenAI;
	readonly rerank: RerankEndpoint;
}

export const createRetrievalProvider = (
	configuration: RetrievalProviderConfiguration
): RetrievalProvider => {
	const fetch = configuration.fetch ?? globalThis.fetch;
	return {
		client: new OpenAI({
			apiKey: configuration.apiKey,
			baseURL: configuration.baseURL,
			fetch,
			timeout: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 120_000),
			defaultHeaders: {
				'HTTP-Referer': configuration.appURL,
				'X-OpenRouter-Title': 'FollowThrough'
			}
		}),
		rerank: {
			url: `${configuration.baseURL}/rerank`,
			fetch,
			headers: {
				authorization: `Bearer ${configuration.apiKey}`,
				'HTTP-Referer': configuration.appURL,
				'X-Title': 'FollowThrough'
			}
		}
	};
};
