import { ExternalServiceError } from '$lib/models';
import type { SearchMatch } from '$lib/models';
import type { Reranker } from '$lib/services';
import { DEFAULT_OPENROUTER_BASE_URL, type OpenRouterClientOptions } from './openrouter-client';

/**
 * Reranker backed by Cohere models served through OpenRouter's `/rerank`
 * endpoint, so it runs on the single OpenRouter key rather than a separate
 * Cohere key. The vector search casts a wide net (cheap recall); the reranker
 * shrinks the candidate set to the final few (precision). No fallback: if
 * reranking fails the caller fails rather than returning unranked candidates.
 */

export const DEFAULT_RERANK_MODEL = 'cohere/rerank-4-fast';

export interface OpenRouterRerankerOptions extends OpenRouterClientOptions {
	readonly model?: string;
}

interface RerankResult {
	readonly index: number;
	readonly relevance_score?: number;
	readonly relevanceScore?: number;
}

/** Titles are retrieval evidence, not display-only metadata. */
export const rerankDocumentText = (match: SearchMatch): string =>
	[match.document.sourceTitle, match.document.sectionPath, match.document.content]
		.filter(Boolean)
		.join('\n');

export class OpenRouterReranker implements Reranker {
	private readonly endpoint: string;
	private readonly appURL: string;
	private readonly model: string;

	constructor(
		private readonly apiKey: string,
		options: OpenRouterRerankerOptions = {}
	) {
		this.endpoint = `${options.baseURL ?? DEFAULT_OPENROUTER_BASE_URL}/rerank`;
		this.appURL = options.appURL ?? 'http://localhost:5173';
		this.model = options.model ?? DEFAULT_RERANK_MODEL;
	}

	async rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]> {
		if (matches.length === 0) return [];
		try {
			const response = await fetch(this.endpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${this.apiKey}`,
					'HTTP-Referer': this.appURL,
					'X-Title': 'FollowThrough'
				},
				body: JSON.stringify({
					model: this.model,
					query,
					documents: matches.map(rerankDocumentText),
					top_n: Math.min(topN, matches.length)
				}),
				signal
			});
			if (!response.ok)
				throw new ExternalServiceError('Reranking failed', {
					cause: `OpenRouter rerank returned ${response.status}`
				});
			const body = (await response.json()) as { results?: readonly RerankResult[] };
			return (body.results ?? [])
				.map((result) => {
					const match = matches[result.index];
					if (!match) return undefined;
					const score = result.relevance_score ?? result.relevanceScore ?? match.score;
					return { document: match.document, score };
				})
				.filter((match): match is SearchMatch => match !== undefined);
		} catch (error) {
			if (signal?.aborted) throw error;
			if (error instanceof ExternalServiceError) throw error;
			throw new ExternalServiceError('Reranking failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
