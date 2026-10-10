import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { EmbeddingProgressStore } from '$lib/server/stores/maintenance/embedding-progress';
import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import { describe, expect, it } from 'vitest';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
const tokenizer = testTokenizer;
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import { Embeddings, type EmbeddingClient } from '$lib/server/services/knowledge-search/embeddings';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
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
		const batchTokens: number[] = [];
		const provider: EmbeddingClient = {
			embeddings: {
				create: async ({ input: contents }) => {
					batchTokens.push(contents.reduce((sum, content) => sum + tokenizer.count(content), 0));
					return { data: contents.map((_, index) => ({ index, embedding: [1, 0, 0] })) };
				}
			}
		};
		const client = new Embeddings('test-key', testTokenizer, {
			client: provider,
			model: 'test-embedding'
		});
		const attachment = view('text/plain', 'report.txt').attachment;
		await createContentIndex(repository, client.model, {
			targetTokens: 700,
			overlapTokens: 50
		}).indexAttachment(testActor(), attachment, text);
		const matches = await repository.search(testActor(), 'amberfalcon', 10);
		const literalMatch = matches.map(({ document }) => ({
			beyondOldLimit: document.chunkIndex >= 50,
			path: document.attachmentPath
		}));
		await new EmbeddingMaintenance(
			new IndexBacklog(repository),
			client,
			new InMemoryTransactionRunner([repository]),
			new EmbeddingProgressStore(),
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
			literalMatch,
			usesMultipleBatches: batchTokens.length > 1,
			respectsBatchBudget: batchTokens.every((tokens) => tokens <= 30_000),
			pending: (await repository.listPendingSources(10)).length,
			tailVector: tail?.document.embedding
		}).toEqual({
			literalMatch: [{ beyondOldLimit: true, path: 'report.txt' }],
			usesMultipleBatches: true,
			respectsBatchBudget: true,
			pending: 0,
			tailVector: [1, 0, 0]
		});
	});
});
