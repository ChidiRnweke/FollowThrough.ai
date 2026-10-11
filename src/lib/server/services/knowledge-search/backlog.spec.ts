import { expect, it } from 'vitest';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { IndexBacklogService } from './backlog';

const stagePending = async (repository: InMemorySearchRepository, noteNumber: number) => {
	const noteId = testNoteId(noteNumber);
	await repository.stage({ kind: 'note', noteId }, [
		searchDocumentBuilder({ noteId, embedding: undefined, embeddingModel: undefined })
	]);
};

it('continues the pending sources of every account after the saved cursor', async () => {
	const owner = new InMemorySearchRepository(testActor());
	await stagePending(owner, 1);
	const other = new InMemorySearchRepository(testActor(2));
	await stagePending(other, 2);
	// One table holds both accounts' rows; the backlog reads across them.
	owner.documents = [...owner.documents, ...other.documents];
	const backlog = new IndexBacklogService(owner);
	const [first] = await backlog.pendingSources(1);
	expect({
		first: first && { userId: first.userId, source: first.source },
		rest: (await backlog.pendingSources(10, first?.cursor)).map((entry) => ({
			userId: entry.userId,
			source: entry.source
		}))
	}).toEqual({
		first: { userId: testActor().userId, source: { kind: 'note', noteId: testNoteId(1) } },
		rest: [{ userId: testActor(2).userId, source: { kind: 'note', noteId: testNoteId(2) } }]
	});
});
