import type { SearchMatch } from '$lib/models/knowledge-search';
import { getDocumentAttributes } from '@arizeai/openinference-core';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import type { Attributes } from '@opentelemetry/api';
import { rerankDocumentText } from './rerank-protocol';

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
