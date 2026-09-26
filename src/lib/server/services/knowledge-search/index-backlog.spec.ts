import { expect, it } from 'vitest';
import { IndexBacklog } from './index-backlog';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

it('retains source context when preparing a pending chunk for embedding', async () => {
	const repository = new InMemorySearchRepository();
	const source = { kind: 'note' as const, noteId: testNoteId(2) };
	const document = searchDocumentBuilder({
		sourceTitle: 'Project decisions',
		content: 'Keep accepted evidence.',
		embedding: undefined,
		embeddingModel: undefined
	});
	await repository.stage(testActor(), source, [document]);
	expect(await new IndexBacklog(repository).read(testActor(), source)).toEqual([
		{ id: document.id, input: 'Project decisions\nKeep accepted evidence.' }
	]);
});
