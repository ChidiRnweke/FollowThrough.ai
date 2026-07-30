import { describe, expect, it } from 'vitest';
import type { ProjectId, SearchDocumentId, SearchMatch } from '$lib/models';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import {
	DEFAULT_RERANK_MODEL,
	rerankDocumentText,
	rerankerInputTraceAttributes,
	rerankerOutputTraceAttributes
} from './ranking';

const match: SearchMatch = {
	document: {
		id: 'document-1' as SearchDocumentId,
		projectId: 'project-1' as ProjectId,
		sourceTitle: 'The Odyssey',
		sectionPath: 'Cyclops',
		content: 'Nobody escapes the cave.',
		contentHash: 'hash-1',
		sourceRevision: 1,
		chunkIndex: 0
	},
	score: 0.8
};

describe('reranker document context', () => {
	it('includes the source title and section with passage content', () => {
		expect(rerankDocumentText(match)).toBe('The Odyssey\nCyclops\nNobody escapes the cave.');
	});
});

describe('reranker trace semantics', () => {
	const inputAttributes = rerankerInputTraceAttributes(
		'Who escaped the cave?',
		[match],
		DEFAULT_RERANK_MODEL,
		3
	);
	const outputAttributes = rerankerOutputTraceAttributes([match]);

	it('records the reranker query', () => {
		expect(inputAttributes[SemanticConventions.RERANKER_QUERY]).toBe('Who escaped the cave?');
	});

	it('records the reranker model', () => {
		expect(inputAttributes[SemanticConventions.RERANKER_MODEL_NAME]).toBe(DEFAULT_RERANK_MODEL);
	});

	it('caps top k at the available document count', () => {
		expect(inputAttributes[SemanticConventions.RERANKER_TOP_K]).toBe(1);
	});

	it('records input document content under the reranker convention', () => {
		expect(
			inputAttributes[
				`${SemanticConventions.RERANKER_INPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_CONTENT}`
			]
		).toBe('The Odyssey\nCyclops\nNobody escapes the cave.');
	});

	it('records output document scores under the reranker convention', () => {
		expect(
			outputAttributes[
				`${SemanticConventions.RERANKER_OUTPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_SCORE}`
			]
		).toBe(0.8);
	});
});
