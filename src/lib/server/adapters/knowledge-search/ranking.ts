import { ExternalServiceError } from '$lib/errors';
import {
	rerankResponseSchema,
	type Reranker,
	type SearchMatch
} from '$lib/models/knowledge-search';
import { DEFAULT_RERANK_MODEL, rerankDocumentText } from './rerank-protocol';
import { rerankerInputTraceAttributes, rerankerOutputTraceAttributes } from './rerank-tracing';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import type { OperationObserver } from '$lib/models/telemetry';
const directObserver: OperationObserver = { run: (_name, _context, body) => body() };

const DEFAULT_LANGUAGE_MODEL_BASE_URL = 'https://openrouter.ai/api/v1';

interface LanguageModelClientOptions {
	readonly baseURL?: string;
	readonly appURL?: string;
}

/**
 * Reranker backed by Cohere models served through OpenRouter's `/rerank`
 * endpoint, so it runs on the single OpenRouter key rather than a separate
 * Cohere key. The vector search casts a wide net (cheap recall); the reranker
 * shrinks the candidate set to the final few (precision). This adapter reports
 * provider failures; the calling controller owns the vector-order fallback.
 */

export interface SearchRankingOptions extends LanguageModelClientOptions {
	readonly model?: string;
	readonly observer?: OperationObserver;
}

export class SearchRanking implements Reranker {
	private readonly endpoint: string;
	private readonly appURL: string;
	private readonly model: string;
	private readonly observer: OperationObserver;

	constructor(
		private readonly apiKey: string,
		options: SearchRankingOptions = {}
	) {
		this.endpoint = `${options.baseURL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL}/rerank`;
		this.appURL = options.appURL ?? 'http://localhost:5173';
		this.model = options.model ?? DEFAULT_RERANK_MODEL;
		this.observer = options.observer ?? directObserver;
	}

	async rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]> {
		if (matches.length === 0) return [];
		try {
			return await this.observer.run(
				'retrieval.rerank',
				{
					input: JSON.stringify({
						query,
						documents: matches.map((match) => ({
							id: match.document.id,
							content: rerankDocumentText(match),
							score: match.score
						}))
					}),
					inputMimeType: MimeType.JSON,
					outputMimeType: MimeType.JSON,
					kind: OpenInferenceSpanKind.RERANKER,
					metadata: { model: this.model, topN },
					attributes: rerankerInputTraceAttributes(query, matches, this.model, topN)
				},
				async () => {
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
					const body = rerankResponseSchema.parse(await response.json());
					return body.results
						.map((result) => {
							const match = matches[result.index];
							if (!match) return undefined;
							const score = result.relevance_score ?? result.relevanceScore ?? match.score;
							return { document: match.document, score };
						})
						.filter((match): match is SearchMatch => match !== undefined);
				},
				(results) =>
					JSON.stringify({
						results: results.map((result) => ({
							documentId: result.document.id,
							sourceTitle: result.document.sourceTitle,
							score: result.score,
							content: result.document.content
						}))
					}),
				rerankerOutputTraceAttributes
			);
		} catch (error) {
			if (signal?.aborted) throw error;
			if (error instanceof ExternalServiceError) throw error;
			throw new ExternalServiceError('Reranking failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
