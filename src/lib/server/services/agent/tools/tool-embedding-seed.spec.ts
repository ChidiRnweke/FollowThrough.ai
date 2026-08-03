import { describe, expect, it } from 'vitest';
import type { ToolEmbeddingWrite } from '$lib/server/repositories/agent/tool-embeddings';
import {
	InMemoryToolEmbeddingRepository,
	RecordingEmbeddings
} from '$lib/testing/agent/fakes/in-memory-tool-embeddings';
import type { ToolCatalogEntry } from '$lib/models/agent/tool-catalog';
import { seedToolEmbeddings, toolContentHash } from './tool-embedding-seed';

const catalog: readonly ToolCatalogEntry[] = [
	{ name: 'create_note', description: 'Create a note' },
	{ name: 'archive_note', description: 'Archive a note' }
];

const storedRow = (entry: ToolCatalogEntry, model = 'test-model'): ToolEmbeddingWrite => ({
	...entry,
	contentHash: toolContentHash(entry),
	embedding: [1, 0],
	embeddingModel: model
});

describe('seedToolEmbeddings', () => {
	it('embeds the whole catalog into an empty table', async () => {
		const summary = await seedToolEmbeddings(
			new InMemoryToolEmbeddingRepository(),
			new RecordingEmbeddings(),
			catalog
		);
		expect(summary).toEqual({ embedded: 2, unchanged: 0, removed: 0 });
	});

	it('embeds the name + description text the query side ranks against', async () => {
		const embeddings = new RecordingEmbeddings();
		await seedToolEmbeddings(new InMemoryToolEmbeddingRepository(), embeddings, catalog);
		expect(embeddings.requests).toEqual([
			['create_note: Create a note', 'archive_note: Archive a note']
		]);
	});

	it('stores one row per catalog entry', async () => {
		const repository = new InMemoryToolEmbeddingRepository();
		await seedToolEmbeddings(repository, new RecordingEmbeddings(), catalog);
		expect([...repository.rows.keys()]).toEqual(['create_note', 'archive_note']);
	});

	it('is a no-op when nothing drifted', async () => {
		const summary = await seedToolEmbeddings(
			new InMemoryToolEmbeddingRepository(catalog.map((entry) => storedRow(entry))),
			new RecordingEmbeddings(),
			catalog
		);
		expect(summary).toEqual({ embedded: 0, unchanged: 2, removed: 0 });
	});

	it('does not call the embedder when nothing drifted', async () => {
		const embeddings = new RecordingEmbeddings();
		await seedToolEmbeddings(
			new InMemoryToolEmbeddingRepository(catalog.map((entry) => storedRow(entry))),
			embeddings,
			catalog
		);
		expect(embeddings.requests).toEqual([]);
	});

	it('re-embeds only the tool whose description changed', async () => {
		const embeddings = new RecordingEmbeddings();
		const repository = new InMemoryToolEmbeddingRepository([
			storedRow(catalog[0]!),
			storedRow({ ...catalog[1]!, description: 'old wording' })
		]);
		await seedToolEmbeddings(repository, embeddings, catalog);
		expect(embeddings.requests).toEqual([['archive_note: Archive a note']]);
	});

	it('stores the new description on a changed tool', async () => {
		const repository = new InMemoryToolEmbeddingRepository([
			storedRow(catalog[0]!),
			storedRow({ ...catalog[1]!, description: 'old wording' })
		]);
		await seedToolEmbeddings(repository, new RecordingEmbeddings(), catalog);
		expect(repository.rows.get('archive_note')?.description).toBe('Archive a note');
	});

	it('re-embeds everything when the embedding model changed', async () => {
		const summary = await seedToolEmbeddings(
			new InMemoryToolEmbeddingRepository(
				catalog.map((entry) => storedRow(entry, 'previous-model'))
			),
			new RecordingEmbeddings(),
			catalog
		);
		expect(summary.embedded).toBe(2);
	});

	it('stamps the active model on re-embedded rows', async () => {
		const repository = new InMemoryToolEmbeddingRepository(
			catalog.map((entry) => storedRow(entry, 'previous-model'))
		);
		await seedToolEmbeddings(repository, new RecordingEmbeddings(), catalog);
		expect(repository.rows.get('create_note')?.embeddingModel).toBe('test-model');
	});

	it('drops rows for tools that left the catalog', async () => {
		const summary = await seedToolEmbeddings(
			new InMemoryToolEmbeddingRepository([
				...catalog.map((entry) => storedRow(entry)),
				storedRow({ name: 'retired_tool', description: 'No longer defined' })
			]),
			new RecordingEmbeddings(),
			catalog
		);
		expect(summary.removed).toBe(1);
	});

	it('removes the retired tool from the store', async () => {
		const repository = new InMemoryToolEmbeddingRepository([
			...catalog.map((entry) => storedRow(entry)),
			storedRow({ name: 'retired_tool', description: 'No longer defined' })
		]);
		await seedToolEmbeddings(repository, new RecordingEmbeddings(), catalog);
		expect(repository.rows.has('retired_tool')).toBe(false);
	});

	it('fails loudly when the embedder returns fewer vectors than inputs', async () => {
		const embeddings = new RecordingEmbeddings();
		embeddings.vectors = [];
		await expect(
			seedToolEmbeddings(new InMemoryToolEmbeddingRepository(), embeddings, catalog)
		).rejects.toThrow(/no vector at index 0/);
	});
});
