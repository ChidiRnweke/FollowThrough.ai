import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryMaintenanceProgress } from '$lib/testing/maintenance/fakes/in-memory-maintenance-progress';
import { describe, expect, it } from 'vitest';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
const tokenizer = testTokenizer;
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import { retrievalTransport } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
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
		const repository = new InMemorySearchRepository(testActor());
		const batchTokens: number[] = [];
		const transport: typeof globalThis.fetch = async (_url, init) => {
			const contents: string[] = JSON.parse(String(init?.body)).input;
			batchTokens.push(contents.reduce((sum, content) => sum + tokenizer.count(content), 0));
			return Response.json({
				data: contents.map((_, index) => ({
					index,
					embedding: Buffer.from(new Float32Array([1, 0, 0]).buffer).toString('base64')
				}))
			});
		};
		const client = retrievalTransport(transport, 'test-embedding');
		const attachment = view('text/plain', 'report.txt').attachment;
		await createContentIndex(repository, client.model, {
			targetTokens: 700,
			overlapTokens: 50
		}).indexAttachment(attachment, text);
		const matches = await repository.search('amberfalcon', 10);
		const literalMatch = matches.map(({ document }) => ({
			beyondOldLimit: document.chunkIndex >= 50,
			path: document.attachmentPath
		}));
		await new EmbeddingMaintenance(
			createContentIndex(repository, client.model, undefined, false, client),
			new InMemoryTransactionRunner([repository]),
			new InMemoryMaintenanceProgress(),
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
