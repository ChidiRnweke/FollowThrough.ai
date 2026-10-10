import { expect, it } from 'vitest';
import {
	toolCatalogFixture as catalog,
	storedTool,
	toolDiscoveryFixture
} from '$lib/testing/agent/fixtures/tool-discovery';

it('seeds all catalog entries with their active-model vectors', async () => {
	const { controller, repository } = await toolDiscoveryFixture();
	const result = await controller.seed(catalog);
	expect({
		result,
		rows: [...repository.rows.values()].map(({ name, embedding, embeddingModel, description }) => ({
			name,
			embedding,
			embeddingModel,
			description
		}))
	}).toEqual({
		result: { embedded: 3, unchanged: 0, removed: 0 },
		rows: catalog.map(({ name, description }) => ({
			name,
			embedding: [0, 1],
			embeddingModel: 'test-model',
			description
		}))
	});
});

it('keeps an unchanged catalog usable when the embedding provider is unavailable', async () => {
	const { controller, embeddings } = await toolDiscoveryFixture(
		catalog.map((tool) => storedTool(tool))
	);
	embeddings.failure = new Error('Provider unavailable');
	expect(await controller.seed(catalog)).toEqual({ embedded: 0, unchanged: 3, removed: 0 });
});

it('replaces only the vector whose discovery text changed', async () => {
	const { controller, repository } = await toolDiscoveryFixture(
		catalog.map((tool) =>
			storedTool(tool.name === 'archive_note' ? { ...tool, description: 'Old wording' } : tool)
		)
	);
	await controller.seed(catalog);
	expect({
		vectors: [...repository.rows.values()].map(({ name, embedding }) => ({ name, embedding })),
		archiveDescription: repository.rows.get('archive_note')?.description
	}).toEqual({
		vectors: [
			{ name: 'create_note', embedding: [1, 0] },
			{ name: 'archive_note', embedding: [0, 1] },
			{ name: 'pin_note', embedding: [1, 0] }
		],
		archiveDescription: 'Archive a note'
	});
});

it('replaces all vectors after an embedding model change', async () => {
	const { controller } = await toolDiscoveryFixture(
		catalog.map((tool) => storedTool(tool, [1, 0], 'old-model'))
	);
	expect(await controller.seed(catalog)).toEqual({ embedded: 3, unchanged: 0, removed: 0 });
});

it('removes retired tools from the stored index', async () => {
	const { controller, repository } = await toolDiscoveryFixture([
		...catalog.map((tool) => storedTool(tool)),
		storedTool({ name: 'retired', description: 'Removed tool' })
	]);
	await controller.seed(catalog);
	expect([...repository.rows.keys()]).toEqual(catalog.map((tool) => tool.name));
});

it('rejects a short provider batch before replacing stored vectors', async () => {
	const { controller, embeddings } = await toolDiscoveryFixture();
	embeddings.vectors = [];
	await expect(controller.seed(catalog)).rejects.toMatchObject({
		code: 'INVALID_GENERATED_CONTENT'
	});
});

it('restores earlier vectors if pruning fails after writing replacements', async () => {
	const original = [await storedTool({ ...catalog[0]!, description: 'Old wording' })];
	const { controller, repository } = await toolDiscoveryFixture(original);
	repository.pruneFailure = new Error('Pruning failed');
	await controller.seed(catalog).then(
		() => {
			throw new Error('Expected pruning failure');
		},
		(error) => {
			if (error !== repository.pruneFailure) throw error;
		}
	);
	expect([...repository.rows.values()]).toEqual(original);
});

it('leaves stored tools intact when embedding fails', async () => {
	const original = [await storedTool({ ...catalog[0]!, description: 'Old wording' })];
	const { controller, repository, embeddings } = await toolDiscoveryFixture(original);
	embeddings.failure = new Error('Provider unavailable');
	await controller.seed(catalog).then(
		() => {
			throw new Error('Expected provider failure');
		},
		(error) => {
			if (error !== embeddings.failure) throw error;
		}
	);
	expect([...repository.rows.values()]).toEqual(original);
});
