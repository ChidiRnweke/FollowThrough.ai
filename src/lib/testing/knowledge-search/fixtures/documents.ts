import type { SearchDocument, SearchDocumentId } from '$lib/models/knowledge-search';
import { testNoteId, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

export const searchDocumentBuilder = (overrides: Partial<SearchDocument> = {}): SearchDocument => ({
	id: crypto.randomUUID() as SearchDocumentId,
	projectId: testProjectId(),
	noteId: testNoteId(2),
	content: 'The platform uses asynchronous messaging.',
	contentHash: 'fixture',
	sourceRevision: 1,
	chunkIndex: 0,
	embedding: [1, 0, 0],
	embeddingModel: 'fake',
	...overrides
});
