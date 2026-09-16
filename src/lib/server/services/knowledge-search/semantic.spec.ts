import { describe, expect, it } from 'vitest';
import type { SearchDocument, SearchDocumentId } from '$lib/models/knowledge-search';
import { KnowledgeLookup, queryVector, knowledgeSearchSource } from './semantic';
import type { AttachmentId } from '$lib/models/attachments';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
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
	it('identifies an attachment chunk by its source rather than the containing note', () => {
		const attachmentId = crypto.randomUUID() as AttachmentId;
		expect(knowledgeSearchSource(document({ attachmentId }))).toMatchObject({
			kind: 'attachment',
			id: attachmentId
		});
	});
	it('rejects a query batch containing more than one vector', () => {
		expect(() => queryVector({ model: 'fake', vectors: [[1], [2]] })).toThrow('invalid result');
	});

	it('limits vector results to the requested project', async () => {
		const repository = new InMemorySearchRepository();
		await repository.replaceForNote(testActor(), testNoteId(2), [document()]);
		await repository.replaceForNote(testActor(), testNoteId(3), [
			document({ noteId: testNoteId(3), projectId: testProjectId(2) })
		]);
		const searcher = new KnowledgeLookup(repository);
		const matches = await searcher.search(testActor(), [1, 0, 0], 10, testProjectId());
		expect(matches.map((match) => match.document.noteId)).toEqual([testNoteId(2)]);
	});

	it('limits vector results to the requested note', async () => {
		const repository = new InMemorySearchRepository();
		await repository.replaceForNote(testActor(), testNoteId(2), [document()]);
		await repository.replaceForNote(testActor(), testNoteId(3), [
			document({ noteId: testNoteId(3) })
		]);
		const searcher = new KnowledgeLookup(repository);
		const matches = await searcher.search(testActor(), [1, 0, 0], 10, undefined, {
			noteId: testNoteId(3)
		});
		expect(matches.map((match) => match.document.noteId)).toEqual([testNoteId(3)]);
	});
});
