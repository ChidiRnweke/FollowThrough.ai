import { expect, it } from 'vitest';
import {
	toolCatalogFixture as catalog,
	storedTool,
	toolDiscoveryFixture
} from '$lib/testing/agent/fixtures/tool-discovery';

const seeded = () =>
	toolDiscoveryFixture([
		storedTool(catalog[0]!, [1, 0]),
		storedTool(catalog[1]!, [0, 1]),
		storedTool(catalog[2]!, [1, 1])
	]);

it('returns the nearest tools within the requested result count', async () => {
	const { controller } = seeded();
	expect(await controller.retrieve(catalog, 'tidy up old notes', 2)).toEqual([
		'archive_note',
		'pin_note'
	]);
});

it('excludes tools outside the permitted discovery catalog', async () => {
	const { controller } = seeded();
	expect(await controller.retrieve([catalog[0]!], 'tidy up old notes', 5)).toEqual(['create_note']);
});

it('returns an empty catalog even when the provider is unavailable', async () => {
	const { controller, embeddings } = toolDiscoveryFixture();
	embeddings.failure = new Error('Provider unavailable');
	expect(await controller.retrieve([], 'anything', 5)).toEqual([]);
});

it('fails when a query embedding is missing instead of claiming there are no tools', async () => {
	const { controller, embeddings } = seeded();
	embeddings.vectors = [];
	await expect(controller.retrieve(catalog, 'notes', 5)).rejects.toMatchObject({
		code: 'INVALID_GENERATED_CONTENT'
	});
});

it('propagates an embedding provider failure', async () => {
	const { controller, embeddings } = seeded();
	embeddings.failure = new Error('Provider unavailable');
	await expect(controller.retrieve(catalog, 'notes', 5)).rejects.toBe(embeddings.failure);
});

it('reports an incomplete seed instead of silently omitting an available tool', async () => {
	const { controller } = toolDiscoveryFixture([storedTool(catalog[0]!), storedTool(catalog[1]!)]);
	await expect(controller.retrieve(catalog, 'pin a note', 1)).rejects.toMatchObject({
		code: 'EXTERNAL_SERVICE',
		details: { cause: 'Missing current-model vectors for: pin_note' }
	});
});

it('rejects vectors from a different embedding model', async () => {
	const { controller } = toolDiscoveryFixture(
		catalog.map((tool) => storedTool(tool, [0, 1], 'old-model'))
	);
	await expect(controller.retrieve(catalog, 'notes', 5)).rejects.toMatchObject({
		code: 'EXTERNAL_SERVICE'
	});
});
