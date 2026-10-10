import OpenAI from 'openai';
import {
	DEFAULT_EMBEDDING_MODEL,
	type EmbeddingClient
} from '$lib/models/knowledge-search/embeddings';
import {
	DEFAULT_SEARCH_QUERY_MODEL,
	type SearchQueryGenerator
} from '$lib/models/knowledge-search/query-generation';
import type { OperationObserver } from '$lib/server/adapters/telemetry/tracing';
import { Embeddings } from '$lib/server/adapters/knowledge-search/embeddings';
import { SearchQueryGeneration } from '$lib/server/adapters/knowledge-search/query-generation';

export interface RetrievalProviderConfiguration {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
	readonly model?: string;
	readonly fetch?: typeof globalThis.fetch;
}

const createClient = (configuration: RetrievalProviderConfiguration): OpenAI =>
	new OpenAI({
		apiKey: configuration.apiKey,
		baseURL: configuration.baseURL,
		fetch: configuration.fetch,
		timeout: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 120_000),
		defaultHeaders: {
			'HTTP-Referer': configuration.appURL,
			'X-OpenRouter-Title': 'FollowThrough'
		}
	});

export const createEmbeddings = (
	configuration: RetrievalProviderConfiguration,
	observer: OperationObserver
): EmbeddingClient =>
	new Embeddings(
		createClient(configuration),
		configuration.model ?? DEFAULT_EMBEDDING_MODEL,
		observer
	);

export const createSearchQueryGeneration = (
	configuration: RetrievalProviderConfiguration
): SearchQueryGenerator =>
	new SearchQueryGeneration(
		createClient(configuration),
		configuration.model ?? DEFAULT_SEARCH_QUERY_MODEL
	);
