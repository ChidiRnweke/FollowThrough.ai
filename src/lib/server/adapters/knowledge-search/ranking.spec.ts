import { describe, expect, it } from 'vitest';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocumentId, SearchMatch } from '$lib/models/knowledge-search';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import { DEFAULT_RERANK_MODEL, rerankDocumentText } from './rerank-protocol';
import { rerankerInputTraceAttributes, rerankerOutputTraceAttributes } from './rerank-tracing';

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
		expect(rerankDocumentText(match)).toBe(
			'Title: "The Odyssey"\nSection: "Cyclops"\nContent: |-\n  Nobody escapes the cave.'
		);
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

	it('records the query, model, capped input count, and document content for one rerank', () => {
		expect(inputAttributes).toMatchObject({
			[SemanticConventions.RERANKER_QUERY]: 'Who escaped the cave?',
			[SemanticConventions.RERANKER_MODEL_NAME]: DEFAULT_RERANK_MODEL,
			[SemanticConventions.RERANKER_TOP_K]: 1,
			[`${SemanticConventions.RERANKER_INPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_CONTENT}`]:
				'Title: "The Odyssey"\nSection: "Cyclops"\nContent: |-\n  Nobody escapes the cave.'
		});
	});

	it('records output document scores under the reranker convention', () => {
		expect(
			outputAttributes[
				`${SemanticConventions.RERANKER_OUTPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_SCORE}`
			]
		).toBe(0.8);
	});
});
