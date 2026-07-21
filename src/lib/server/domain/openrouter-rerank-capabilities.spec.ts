import { describe, expect, it } from 'vitest';
import type { ProjectId, SearchDocumentId, SearchMatch } from '$lib/models';
import { rerankDocumentText } from './openrouter-rerank-capabilities';

describe('reranker document context', () => {
	it('includes the source title and section with passage content', () => {
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
		expect(rerankDocumentText(match)).toBe('The Odyssey\nCyclops\nNobody escapes the cave.');
	});
});
