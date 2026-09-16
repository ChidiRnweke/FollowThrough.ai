import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import { describe, expect, it } from 'vitest';
import {
	ContentIndex,
	TokenAwareChunker,
	retrievalEncoding
} from '$lib/server/services/knowledge-search/indexing';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import { Embeddings, type EmbeddingClient } from '$lib/server/services/knowledge-search/embeddings';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { view } from '$lib/testing/attachments/fakes/processing';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';

const text =
	Array.from(
		{ length: 60 },
		(_, index) => `Section ${index}. ${'Detailed evidence for the report. '.repeat(100)}`
	).join('\n\n') + '\n\nThe final approval code is amberfalcon.';

describe('complete attachment search', () => {
	it('makes text beyond fifty chunks available to literal search before embedding', async () => {
		const repository = new InMemorySearchRepository();
		const attachment = view('text/plain', 'report.txt').attachment;
		await new ContentIndex(
			repository,
			new InMemoryEmbeddingClient().model,
			new TokenAwareChunker(700, 50)
		).attachments.index(testActor(), attachment, text);
		const matches = await repository.search(testActor(), 'amberfalcon', 10);
		expect(
			matches.map(({ document }) => ({
				beyondOldLimit: document.chunkIndex >= 50,
				path: document.attachmentPath
			}))
		).toEqual([{ beyondOldLimit: true, path: 'report.txt' }]);
	});

	it('embeds the complete document in bounded batches without dropping its tail', async () => {
		const repository = new InMemorySearchRepository();
		const batchTokens: number[] = [];
		const provider: EmbeddingClient = {
			embeddings: {
				create: async ({ input: contents }) => {
					batchTokens.push(
						contents.reduce((sum, content) => sum + retrievalEncoding().encode(content).length, 0)
					);
					return { data: contents.map((_, index) => ({ index, embedding: [1, 0, 0] })) };
				}
			}
		};
		const client = new Embeddings('test-key', { client: provider, model: 'test-embedding' });
		await new ContentIndex(
			repository,
			client.model,
			new TokenAwareChunker(700, 50)
		).attachments.index(testActor(), view('text/plain').attachment, text);
		await new EmbeddingMaintenance(
			new IndexBacklog(repository),
			client,
			new InMemoryTransactionRunner([repository]),
			{
				logger: {
					log: () => {},
					error: (message) => {
						throw new Error(message);
					}
				}
			}
		).run();
		const tail = repository.documents.find(({ document }) =>
			document.content.includes('amberfalcon')
		);
		expect({
			usesMultipleBatches: batchTokens.length > 1,
			respectsBatchBudget: batchTokens.every((tokens) => tokens <= 30_000),
			pending: (await repository.listPendingSources(10)).length,
			tailVector: tail?.document.embedding
		}).toEqual({
			usesMultipleBatches: true,
			respectsBatchBudget: true,
			pending: 0,
			tailVector: [1, 0, 0]
		});
	});
});
