import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryMaintenanceProgress } from '$lib/testing/maintenance/fakes/in-memory-maintenance-progress';
import { describe, expect, it } from 'vitest';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import type { TransactionRunner } from '$lib/server/repositories/workspace';

const immediateTransactions: TransactionRunner = { run: (work) => work() };

const deferredIndexer = (repository: InMemorySearchRepository, client: InMemoryRetrievalProvider) =>
	createContentIndex(
		repository,
		client.model,
		{ targetTokens: 200, overlapTokens: 0 },
		true,
		client
	);

const backfill = (repository: InMemorySearchRepository, client: InMemoryRetrievalProvider) =>
	new EmbeddingMaintenance(
		createContentIndex(repository, client.model, undefined, false, client),
		immediateTransactions,
		new InMemoryMaintenanceProgress(),
		{
			logger: {
				error: (_message, error: Error) => {
					throw error;
				},
				log: () => {}
			}
		}
	);

describe('Deferred embedding write path', () => {
	it('stages deferred text for lexical but not semantic search', async () => {
		const repository = new InMemorySearchRepository(testActor());
		const client = new InMemoryRetrievalProvider();
		const actor = testActor();
		const note = noteBuilder({ plainText: 'Kubernetes ingress notes' });
		await deferredIndexer(repository, client).indexNote(note);

		const pending = await repository.listPending({ kind: 'note', noteId: note.id });
		const lexical = await repository.search('ingress', 10);
		const semantic = await repository.searchByEmbedding([1, 2, 3], 10);
		expect({ pending: pending.length, lexical: lexical.length, semantic: semantic.length }).toEqual(
			{
				pending: 1,
				lexical: 1,
				semantic: 0
			}
		);
	});
});

describe('Embedding backfill', () => {
	it('embeds the chunks the write path skipped', async () => {
		const repository = new InMemorySearchRepository(testActor());
		const client = new InMemoryRetrievalProvider();
		await deferredIndexer(repository, client).indexNote(
			noteBuilder({ plainText: 'Kubernetes ingress notes' })
		);

		await backfill(repository, client).run();

		expect({
			semanticCount: (await repository.searchByEmbedding([1, 2, 3], 10)).length,
			pending: await repository.listPendingSources(10)
		}).toEqual({ semanticCount: 1, pending: [] });
	});

	it('does nothing when there is no backlog', async () => {
		const repository = new InMemorySearchRepository(testActor());
		const client = new InMemoryRetrievalProvider();
		client.embeddingFailure = new Error('provider unavailable');
		await expect(backfill(repository, client).run()).resolves.toBeUndefined();
	});
});

/**
 * The property the whole superseded-row design exists to protect: editing a note
 * must never make it disappear from semantic search while the replacement chunk
 * waits for its vector.
 */
describe('Semantic continuity across an edit', () => {
	const indexAndBackfill = async () => {
		const repository = new InMemorySearchRepository(testActor());
		const client = new InMemoryRetrievalProvider();
		const indexer = deferredIndexer(repository, client);
		await indexer.indexNote(noteBuilder({ plainText: 'Original ingress notes' }));
		await backfill(repository, client).run();
		return { repository, client, indexer };
	};

	it('preserves old semantic results while replacement text takes over lexical search', async () => {
		const { repository, indexer } = await indexAndBackfill();

		await indexer.indexNote(noteBuilder({ plainText: 'Rewritten egress notes' }));

		const semantic = await repository.searchByEmbedding([1, 2, 3], 10);
		const lexicalCurrent = await repository.search('egress', 10);
		const lexicalSuperseded = await repository.search('ingress', 10);
		expect({
			semantic: semantic.map((match) => match.document.content),
			lexicalCurrent: lexicalCurrent.map((match) => match.document.content),
			lexicalSuperseded: lexicalSuperseded.map((match) => match.document.content)
		}).toEqual({
			semantic: ['Original ingress notes'],
			lexicalCurrent: ['Rewritten egress notes'],
			lexicalSuperseded: []
		});
	});

	it('swaps semantic search to the new text and retires the old row after backfill', async () => {
		const { repository, client, indexer } = await indexAndBackfill();
		await indexer.indexNote(noteBuilder({ plainText: 'Rewritten egress notes' }));

		await backfill(repository, client).run();

		const matches = await repository.searchByEmbedding([1, 2, 3], 10);
		expect({
			semantic: matches.map((match) => match.document.content),
			remainingRows: repository.documents.length
		}).toEqual({ semantic: ['Rewritten egress notes'], remainingRows: 1 });
	});

	it('keeps answering semantically when a further edit lands mid-backfill', async () => {
		const source = { kind: 'note', noteId: noteBuilder().id } as const;
		const { repository, client, indexer } = await indexAndBackfill();
		await indexer.indexNote(noteBuilder({ plainText: 'Second revision' }));

		// Reproduces the race the worker guards against: it reads the pending chunks,
		// then a third revision is staged before it writes the vectors back. The rows
		// superseded by that third revision are the only embedded ones left, so
		// retiring them here would blind the note until the next tick.
		const inFlight = await repository.listPending(source);
		await indexer.indexNote(noteBuilder({ plainText: 'Third revision' }));
		await repository.completePending(
			source,
			inFlight.map((document) => ({ id: document.id, embedding: [9, 9, 9] })),
			client.model
		);

		expect(await repository.searchByEmbedding([1, 2, 3], 10)).not.toHaveLength(0);
	});
});
