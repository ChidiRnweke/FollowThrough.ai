import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { expect, it } from 'vitest';
import { inMemoryEmbeddingSweep } from '$lib/testing/knowledge-search/fixtures/embedding-sweep';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = async () => {
	const repository = new InMemorySearchRepository(testActor());
	const client = new InMemoryRetrievalProvider();
	client.rejectedContents.add('Poisoned');
	for (let id = 1; id <= 4; id++) {
		const noteId = testNoteId(id);
		await repository.stage({ kind: 'note', noteId }, [
			searchDocumentBuilder({
				noteId,
				content: id <= 2 ? 'Poisoned' : 'Healthy',
				embedding: undefined,
				embeddingModel: undefined
			})
		]);
	}
	const worker = inMemoryEmbeddingSweep(repository, client, {
		maxSourcesPerTick: 2,
		logger: { error: () => {}, log: () => {} }
	});
	return { repository, client, worker };
};

it('gets past poison sources, then retries them after recovery', async () => {
	const { repository, client, worker } = await setup();
	await worker.run();
	await worker.run();
	const healthy = repository.documents
		.filter(({ document }) => document.embedding)
		.map(({ document }) => document.noteId);
	client.rejectedContents.clear();
	await worker.run();
	expect({ healthy, pending: await repository.listPendingSources(10) }).toEqual({
		healthy: [testNoteId(3), testNoteId(4)],
		pending: []
	});
});
