import { getDocumentAttributes } from '@arizeai/openinference-core';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import type { Attributes } from '@opentelemetry/api';

/** A reranker document as the provider received it. */
export interface RerankTraceDocument {
	readonly id: string;
	readonly content: string;
	readonly score?: number;
}

const documentAttributes = (
	documents: readonly RerankTraceDocument[],
	prefix: string
): Attributes =>
	documents.reduce<Attributes>(
		(attributes, document, index) => ({
			...attributes,
			...getDocumentAttributes(document, index, prefix)
		}),
		{}
	);

export const rerankerInputTraceAttributes = (
	query: string,
	documents: readonly RerankTraceDocument[],
	model: string,
	topN: number
): Attributes => ({
	[SemanticConventions.RERANKER_QUERY]: query,
	[SemanticConventions.RERANKER_MODEL_NAME]: model,
	[SemanticConventions.RERANKER_TOP_K]: Math.min(topN, documents.length),
	// Forty candidates already consume 80 attributes at id + content. Omitting
	// their pre-rerank scores leaves room for all scored output documents under
	// OpenTelemetry's common 128-attribute span limit.
	...documentAttributes(
		documents.map(({ id, content }) => ({ id, content })),
		SemanticConventions.RERANKER_INPUT_DOCUMENTS
	)
});

export const rerankerOutputTraceAttributes = (
	documents: readonly RerankTraceDocument[]
): Attributes => documentAttributes(documents, SemanticConventions.RERANKER_OUTPUT_DOCUMENTS);
