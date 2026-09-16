import { expect, it } from 'vitest';
import {
	toolCatalogFixture as catalog,
	storedTool,
	toolDiscoveryFixture
} from '$lib/testing/agent/fixtures/tool-discovery';

it('seeds every catalog entry into an empty index', async () => {
	const { controller } = toolDiscoveryFixture();
	expect(await controller.seed(catalog)).toEqual({ embedded: 3, unchanged: 0, removed: 0 });
});

it('stores the generated vectors with the active model', async () => {
	const { controller, repository } = toolDiscoveryFixture();
	await controller.seed(catalog);
	expect(
		[...repository.rows.values()].map(({ name, embedding, embeddingModel }) => ({
			name,
			embedding,
			embeddingModel
		}))
	).toEqual(catalog.map(({ name }) => ({ name, embedding: [0, 1], embeddingModel: 'test-model' })));
});

it('keeps an unchanged catalog usable when the embedding provider is unavailable', async () => {
	const { controller, embeddings } = toolDiscoveryFixture(catalog.map((tool) => storedTool(tool)));
	embeddings.failure = new Error('Provider unavailable');
	expect(await controller.seed(catalog)).toEqual({ embedded: 0, unchanged: 3, removed: 0 });
});

it('replaces only the vector whose discovery text changed', async () => {
	const { controller, repository } = toolDiscoveryFixture(
		catalog.map((tool) =>
			storedTool(tool.name === 'archive_note' ? { ...tool, description: 'Old wording' } : tool)
		)
	);
	await controller.seed(catalog);
	expect([...repository.rows.values()].map(({ name, embedding }) => ({ name, embedding }))).toEqual(
		[
			{ name: 'create_note', embedding: [1, 0] },
			{ name: 'archive_note', embedding: [0, 1] },
			{ name: 'pin_note', embedding: [1, 0] }
		]
	);
});

it('stores the current description when a tool changes', async () => {
	const { controller, repository } = toolDiscoveryFixture([
		storedTool({ ...catalog[1]!, description: 'Old wording' })
	]);
	await controller.seed(catalog);
	expect(repository.rows.get('archive_note')?.description).toBe('Archive a note');
});

it('replaces all vectors after an embedding model change', async () => {
	const { controller } = toolDiscoveryFixture(
		catalog.map((tool) => storedTool(tool, [1, 0], 'old-model'))
	);
	expect(await controller.seed(catalog)).toEqual({ embedded: 3, unchanged: 0, removed: 0 });
});

it('removes retired tools from the stored index', async () => {
	const { controller, repository } = toolDiscoveryFixture([
		...catalog.map((tool) => storedTool(tool)),
		storedTool({ name: 'retired', description: 'Removed tool' })
	]);
	await controller.seed(catalog);
	expect([...repository.rows.keys()]).toEqual(catalog.map((tool) => tool.name));
});

it('rejects a short provider batch before replacing stored vectors', async () => {
	const { controller, embeddings } = toolDiscoveryFixture();
	embeddings.vectors = [];
	await expect(controller.seed(catalog)).rejects.toMatchObject({
		code: 'INVALID_GENERATED_CONTENT'
	});
});

it('restores earlier vectors if pruning fails after writing replacements', async () => {
	const original = [storedTool({ ...catalog[0]!, description: 'Old wording' })];
	const { controller, repository } = toolDiscoveryFixture(original);
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
	const original = [storedTool({ ...catalog[0]!, description: 'Old wording' })];
	const { controller, repository, embeddings } = toolDiscoveryFixture(original);
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
