import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import { expect, it } from 'vitest';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = async () => {
	const repository = new InMemorySearchRepository();
	const client = new InMemoryEmbeddingClient();
	client.rejectedContents.add('Poisoned');
	for (let id = 1; id <= 4; id++) {
		const noteId = testNoteId(id);
		await repository.stage(testActor(), { kind: 'note', noteId }, [
			searchDocumentBuilder({
				noteId,
				content: id <= 2 ? 'Poisoned' : 'Healthy',
				embedding: undefined,
				embeddingModel: undefined
			})
		]);
	}
	const worker = new EmbeddingMaintenance(
		new IndexBacklog(repository),
		client,
		new InMemoryTransactionRunner([repository]),
		{ maxSourcesPerTick: 2, logger: { error: () => {}, log: () => {} } }
	);
	return { repository, client, worker };
};

it('reaches healthy sources after a full batch of persistent failures', async () => {
	const { repository, worker } = await setup();
	await worker.run();
	await worker.run();
	expect(
		repository.documents
			.filter(({ document }) => document.embedding)
			.map(({ document }) => document.noteId)
	).toEqual([testNoteId(3), testNoteId(4)]);
});

it('wraps around and retries earlier sources after they recover', async () => {
	const { repository, client, worker } = await setup();
	await worker.run();
	await worker.run();
	client.rejectedContents.clear();
	await worker.run();
	expect(await repository.listPendingSources(10)).toEqual([]);
});
