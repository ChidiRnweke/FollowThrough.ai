import { z } from 'zod';

export interface SearchQueryPrompt {
	readonly system: string;
	readonly user: string;
}

export interface SearchQueryResult {
	readonly raw: string;
}

export interface SearchQueryGenerator {
	readonly model: string;
	generate(prompt: SearchQueryPrompt): Promise<SearchQueryResult>;
}

export interface SearchQueryCache {
	read(
		text: string
	): Promise<{ readonly kind: 'hit'; readonly query: string } | { readonly kind: 'miss' }>;
	write(text: string, query: string): Promise<void>;
}

export const cachedSearchQuerySchema = z.string();
export const DEFAULT_SEARCH_QUERY_MODEL = 'deepseek/deepseek-v4-flash';
