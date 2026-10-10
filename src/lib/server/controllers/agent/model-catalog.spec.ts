import { describe, expect, it } from 'vitest';
import { CachedAgentModels } from './model-catalog';
import { ModelCatalogStore } from '$lib/server/stores/agent/model-catalog';
import { InMemoryModelCatalog } from '$lib/testing/agent/fakes/in-memory-model-catalog';

const setup = (ttlMs = 300_000) => {
	const source = new InMemoryModelCatalog();
	source.models = [
		{
			id: 'vendor/model',
			name: 'Model',
			provider: 'vendor',
			supportsTools: true,
			supportsVision: false,
			recommended: true,
			capabilities: ['tools']
		}
	];
	return {
		source,
		controller: new CachedAgentModels(source, new ModelCatalogStore(), ttlMs, () => 1000)
	};
};
describe('model catalog refresh', () => {
	it('keeps a successful catalog until its refresh expires', async () => {
		const { source, controller } = setup();
		const first = await controller.list();
		source.models = [];
		expect(await controller.list()).toEqual(first);
	});
	it('retains stale models during a transient refresh failure', async () => {
		const { source, controller } = setup(0);
		const first = await controller.list();
		source.failure = new Error('Temporary provider failure');
		expect(await controller.list()).toEqual(first);
	});
	it('reports the initial provider failure without manufacturing a catalog', async () => {
		const { source, controller } = setup();
		source.failure = new Error('Provider unavailable');
		await expect(controller.list()).rejects.toThrow('Provider unavailable');
	});
	it('replaces the retained catalog after expiration', async () => {
		const { source, controller } = setup(0);
		await controller.list();
		source.models = [];
		expect(await controller.list()).toEqual([]);
	});
});
