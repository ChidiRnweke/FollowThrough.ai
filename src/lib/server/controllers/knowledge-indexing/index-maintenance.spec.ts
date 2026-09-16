import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import { describe, expect, it } from 'vitest';
import { ContentIndex, TokenAwareChunker } from '$lib/server/services/knowledge-search/indexing';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import type { TransactionRunner } from '$lib/server/repositories/workspace';

const immediateTransactions: TransactionRunner = { run: (work) => work() };

const deferredIndexer = (repository: InMemorySearchRepository, client: InMemoryEmbeddingClient) =>
	new ContentIndex(repository, client.model, new TokenAwareChunker(200, 0), true).notes;

const backfill = (repository: InMemorySearchRepository, client: InMemoryEmbeddingClient) =>
	new EmbeddingMaintenance(new IndexBacklog(repository), client, immediateTransactions, {
		logger: {
			error: (_message, error: Error) => {
				throw error;
			},
			log: () => {}
		}
	});

describe('Deferred embedding write path', () => {
	it('stages accepted text even when the embedding provider is unavailable', async () => {
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();
		client.failure = new Error('provider unavailable');

		await deferredIndexer(repository, client).index(
			testActor(),
			noteBuilder({ plainText: 'Kubernetes ingress notes' })
		);

		expect(await repository.search(testActor(), 'ingress', 10)).toHaveLength(1);
	});

	it('leaves the staged chunk awaiting a vector', async () => {
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();

		await deferredIndexer(repository, client).index(
			testActor(),
			noteBuilder({ plainText: 'Kubernetes ingress notes' })
		);

		expect(
			await repository.listPending(testActor(), { kind: 'note', noteId: noteBuilder().id })
		).toHaveLength(1);
	});

	it('makes the new text findable lexically before it is embedded', async () => {
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();

		await deferredIndexer(repository, client).index(
			testActor(),
			noteBuilder({ plainText: 'Kubernetes ingress notes' })
		);

		expect(await repository.search(testActor(), 'ingress', 10)).toHaveLength(1);
	});

	it('keeps the chunk out of semantic search until it has a vector', async () => {
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();

		await deferredIndexer(repository, client).index(
			testActor(),
			noteBuilder({ plainText: 'Kubernetes ingress notes' })
		);

		expect(await repository.searchByEmbedding(testActor(), [1, 2, 3], 10)).toHaveLength(0);
	});
});

describe('Embedding backfill', () => {
	it('embeds the chunks the write path skipped', async () => {
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();
		await deferredIndexer(repository, client).index(
			testActor(),
			noteBuilder({ plainText: 'Kubernetes ingress notes' })
		);

		await backfill(repository, client).run();

		expect(await repository.searchByEmbedding(testActor(), [1, 2, 3], 10)).toHaveLength(1);
	});

	it('leaves nothing pending once it has run', async () => {
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();
		await deferredIndexer(repository, client).index(
			testActor(),
			noteBuilder({ plainText: 'Kubernetes ingress notes' })
		);

		await backfill(repository, client).run();

		expect(await repository.listPendingSources(10)).toEqual([]);
	});

	it('does nothing when there is no backlog', async () => {
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();
		client.failure = new Error('provider unavailable');
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
		const repository = new InMemorySearchRepository();
		const client = new InMemoryEmbeddingClient();
		const indexer = deferredIndexer(repository, client);
		await indexer.index(testActor(), noteBuilder({ plainText: 'Original ingress notes' }));
		await backfill(repository, client).run();
		return { repository, client, indexer };
	};

	it('still answers semantic search with the previous text after an edit', async () => {
		const { repository, indexer } = await indexAndBackfill();

		await indexer.index(testActor(), noteBuilder({ plainText: 'Rewritten egress notes' }));

		const matches = await repository.searchByEmbedding(testActor(), [1, 2, 3], 10);
		expect(matches.map((match) => match.document.content)).toEqual(['Original ingress notes']);
	});

	it('serves the new text lexically while the old text is still embedded', async () => {
		const { repository, indexer } = await indexAndBackfill();

		await indexer.index(testActor(), noteBuilder({ plainText: 'Rewritten egress notes' }));

		const matches = await repository.search(testActor(), 'egress', 10);
		expect(matches.map((match) => match.document.content)).toEqual(['Rewritten egress notes']);
	});

	it('hides the superseded text from lexical search', async () => {
		const { repository, indexer } = await indexAndBackfill();

		await indexer.index(testActor(), noteBuilder({ plainText: 'Rewritten egress notes' }));

		expect(await repository.search(testActor(), 'ingress', 10)).toEqual([]);
	});

	it('swaps semantic search onto the new text once the worker catches up', async () => {
		const { repository, client, indexer } = await indexAndBackfill();
		await indexer.index(testActor(), noteBuilder({ plainText: 'Rewritten egress notes' }));

		await backfill(repository, client).run();

		const matches = await repository.searchByEmbedding(testActor(), [1, 2, 3], 10);
		expect(matches.map((match) => match.document.content)).toEqual(['Rewritten egress notes']);
	});

	it('retires the superseded row once its replacement is embedded', async () => {
		const { repository, client, indexer } = await indexAndBackfill();
		await indexer.index(testActor(), noteBuilder({ plainText: 'Rewritten egress notes' }));

		await backfill(repository, client).run();

		expect(repository.documents).toHaveLength(1);
	});

	it('keeps answering semantically when a further edit lands mid-backfill', async () => {
		const source = { kind: 'note', noteId: noteBuilder().id } as const;
		const { repository, client, indexer } = await indexAndBackfill();
		await indexer.index(testActor(), noteBuilder({ plainText: 'Second revision' }));

		// Reproduces the race the worker guards against: it reads the pending chunks,
		// then a third revision is staged before it writes the vectors back. The rows
		// superseded by that third revision are the only embedded ones left, so
		// retiring them here would blind the note until the next tick.
		const inFlight = await repository.listPending(testActor(), source);
		await indexer.index(testActor(), noteBuilder({ plainText: 'Third revision' }));
		await repository.completePending(
			testActor(),
			source,
			inFlight.map((document) => ({ id: document.id, embedding: [9, 9, 9] })),
			client.model
		);

		expect(await repository.searchByEmbedding(testActor(), [1, 2, 3], 10)).not.toHaveLength(0);
	});
});
