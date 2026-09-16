import { describe, expect, it } from 'vitest';
import type { SearchDocument, SearchDocumentId } from '$lib/models/knowledge-search';
import { EmbeddedKnowledgeSearcher } from './semantic';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import {
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const document = (overrides: Partial<SearchDocument> = {}): SearchDocument => ({
	id: crypto.randomUUID() as SearchDocumentId,
	projectId: testProjectId(),
	noteId: testNoteId(2),
	content: 'The platform uses asynchronous messaging.',
	contentHash: 'hash',
	sourceRevision: 1,
	chunkIndex: 0,
	embedding: [1, 0, 0],
	embeddingModel: 'fake',
	...overrides
});

describe('Embedded search invariants', () => {
	it('returns no matches for an empty query', async () => {
		const searcher = new EmbeddedKnowledgeSearcher(
			new InMemorySearchRepository(),
			new InMemoryEmbeddingClient()
		);
		const matches = await searcher.search(testActor(), '   ');
		expect(matches).toEqual([]);
	});

	it('limits vector results to the requested project', async () => {
		const repository = new InMemorySearchRepository();
		await repository.replaceForNote(testActor(), testNoteId(2), [document()]);
		await repository.replaceForNote(testActor(), testNoteId(3), [
			document({ noteId: testNoteId(3), projectId: testProjectId(2) })
		]);
		const searcher = new EmbeddedKnowledgeSearcher(repository, new InMemoryEmbeddingClient());
		const matches = await searcher.search(testActor(), 'messaging', 10, testProjectId());
		expect(matches.map((match) => match.document.noteId)).toEqual([testNoteId(2)]);
	});

	it('limits vector results to the requested note', async () => {
		const repository = new InMemorySearchRepository();
		await repository.replaceForNote(testActor(), testNoteId(2), [document()]);
		await repository.replaceForNote(testActor(), testNoteId(3), [
			document({ noteId: testNoteId(3) })
		]);
		const searcher = new EmbeddedKnowledgeSearcher(repository, new InMemoryEmbeddingClient());
		const matches = await searcher.search(testActor(), 'messaging', 10, undefined, undefined, {
			noteId: testNoteId(3)
		});
		expect(matches.map((match) => match.document.noteId)).toEqual([testNoteId(3)]);
	});
});
