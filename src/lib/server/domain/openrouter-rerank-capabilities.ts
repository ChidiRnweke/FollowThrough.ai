import { ExternalServiceError } from '$lib/models';
import type { SearchMatch } from '$lib/models';
import type { Reranker } from '$lib/services';
import { getDocumentAttributes } from '@arizeai/openinference-core';
import {
	MimeType,
	OpenInferenceSpanKind,
	SemanticConventions
} from '@arizeai/openinference-semantic-conventions';
import type { Attributes } from '@opentelemetry/api';
import { DEFAULT_OPENROUTER_BASE_URL, type OpenRouterClientOptions } from './openrouter-client';
import { traceOperation } from './telemetry';

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

const documentAttributes = (
	matches: readonly SearchMatch[],
	prefix: string,
	includeScore: boolean
): Attributes =>
	matches.reduce<Attributes>(
		(attributes, match, index) => ({
			...attributes,
			...getDocumentAttributes(
				{
					id: match.document.id,
					content: rerankDocumentText(match),
					...(includeScore ? { score: match.score } : {})
				},
				index,
				prefix
			)
		}),
		{}
	);

export const rerankerInputTraceAttributes = (
	query: string,
	matches: readonly SearchMatch[],
	model: string,
	topN: number
): Attributes => ({
	[SemanticConventions.RERANKER_QUERY]: query,
	[SemanticConventions.RERANKER_MODEL_NAME]: model,
	[SemanticConventions.RERANKER_TOP_K]: Math.min(topN, matches.length),
	// Forty candidates already consume 80 attributes at id + content. Omitting
	// their pre-rerank scores leaves room for all scored output documents under
	// OpenTelemetry's common 128-attribute span limit.
	...documentAttributes(matches, SemanticConventions.RERANKER_INPUT_DOCUMENTS, false)
});

export const rerankerOutputTraceAttributes = (results: readonly SearchMatch[]): Attributes =>
	documentAttributes(results, SemanticConventions.RERANKER_OUTPUT_DOCUMENTS, true);

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
			return await traceOperation(
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
					const body = (await response.json()) as { results?: readonly RerankResult[] };
					return (body.results ?? [])
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
