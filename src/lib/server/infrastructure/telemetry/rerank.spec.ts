import { describe, expect, it } from 'vitest';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import { rerankerInputTraceAttributes, rerankerOutputTraceAttributes } from './rerank';

const document = {
	id: 'document-1',
	content: 'Title: "The Odyssey"\nSection: "Cyclops"\nContent: |-\n  Nobody escapes the cave.',
	score: 0.8
};

describe('reranker trace semantics', () => {
	it('records the query, model, capped input count, and unscored document content', () => {
		const attributes = rerankerInputTraceAttributes(
			'Who escaped the cave?',
			[document],
			'cohere/rerank-4-fast',
			3
		);
		expect({
			query: attributes[SemanticConventions.RERANKER_QUERY],
			model: attributes[SemanticConventions.RERANKER_MODEL_NAME],
			topK: attributes[SemanticConventions.RERANKER_TOP_K],
			content:
				attributes[
					`${SemanticConventions.RERANKER_INPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_CONTENT}`
				],
			score:
				attributes[
					`${SemanticConventions.RERANKER_INPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_SCORE}`
				]
		}).toEqual({
			query: 'Who escaped the cave?',
			model: 'cohere/rerank-4-fast',
			topK: 1,
			content: document.content,
			score: undefined
		});
	});

	it('records output document scores under the reranker convention', () => {
		expect(
			rerankerOutputTraceAttributes([document])[
				`${SemanticConventions.RERANKER_OUTPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_SCORE}`
			]
		).toBe(0.8);
	});
});
