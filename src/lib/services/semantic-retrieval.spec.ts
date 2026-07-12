import { describe, expect, it } from 'vitest';
import type { SearchDocument, SearchDocumentId, TextSelection } from '$lib/models';
import { EmbeddedKnowledgeSearcher, ProjectScopedLinkFinder } from './semantic-retrieval';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/fakes/in-memory-search';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/fixtures/domain-builders';

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

const selection = (text = 'Use asynchronous messaging'): TextSelection => ({
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: text.length,
	text
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
});

describe('Relate retrieval invariants', () => {
	it('does not relate a note to itself', async () => {
		const repository = new InMemorySearchRepository();
		await repository.replaceForNote(testActor(), testNoteId(), [
			document({ noteId: testNoteId() })
		]);
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder()];
		const finder = new ProjectScopedLinkFinder(
			notes,
			new EmbeddedKnowledgeSearcher(repository, new InMemoryEmbeddingClient())
		);
		const links = await finder.find(testActor(), selection());
		expect(links).toEqual([]);
	});

	it('returns one candidate for duplicate chunks from the same note', async () => {
		const repository = new InMemorySearchRepository();
		await repository.replaceForNote(testActor(), testNoteId(2), [
			document(),
			document({ id: crypto.randomUUID() as SearchDocumentId, chunkIndex: 1 })
		]);
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder()];
		const finder = new ProjectScopedLinkFinder(
			notes,
			new EmbeddedKnowledgeSearcher(repository, new InMemoryEmbeddingClient())
		);
		const links = await finder.find(testActor(), selection());
		expect(links).toHaveLength(1);
	});

	it('labels opposite language as a contradiction candidate', async () => {
		const repository = new InMemorySearchRepository();
		await repository.replaceForNote(testActor(), testNoteId(2), [document()]);
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder()];
		const finder = new ProjectScopedLinkFinder(
			notes,
			new EmbeddedKnowledgeSearcher(repository, new InMemoryEmbeddingClient())
		);
		const links = await finder.find(testActor(), selection('Do not use synchronous calls'));
		expect(links[0]?.kind).toBe('contradicts');
	});
});
