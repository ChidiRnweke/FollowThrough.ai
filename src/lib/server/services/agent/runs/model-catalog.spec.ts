import { describe, expect, it } from 'vitest';
import { AgentModels } from './preferences';
import { ModelCatalogStore } from '$lib/server/stores/agent/model-catalog';
import { InMemoryAgentModelReader } from '$lib/testing/agent/fakes/in-memory-agent-model-reader';

const entry = {
	id: 'vendor/model',
	name: 'Model',
	supportedParameters: ['tools'],
	architecture: { inputModalities: ['text'] }
};

const setup = (ttlMs = 300_000) => {
	const source = new InMemoryAgentModelReader([entry]);
	return {
		source,
		catalog: new AgentModels(source, new Set(), new ModelCatalogStore(), ttlMs, () => 1000)
	};
};
const ids = async (catalog: AgentModels) => (await catalog.list()).map((model) => model.id);

describe('model catalog refresh', () => {
	it('keeps a successful catalog until its refresh expires', async () => {
		const { source, catalog } = setup();
		await catalog.list();
		source.entries = [];
		expect(await ids(catalog)).toEqual(['vendor/model']);
	});
	it('retains stale models during a transient refresh failure', async () => {
		const { source, catalog } = setup(0);
		await catalog.list();
		source.failure = new Error('Temporary provider failure');
		expect(await ids(catalog)).toEqual(['vendor/model']);
	});
	it('reports the initial provider failure without manufacturing a catalog', async () => {
		const { source, catalog } = setup();
		source.failure = new Error('Provider unavailable');
		await expect(catalog.list()).rejects.toThrow('Provider unavailable');
	});
	it('replaces the retained catalog after expiration', async () => {
		const { source, catalog } = setup(0);
		await catalog.list();
		source.entries = [];
		expect(await ids(catalog)).toEqual([]);
	});
});
