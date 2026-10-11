import { describe, expect, it } from 'vitest';
import { AgentModels } from './preferences';
import { InMemoryAgentModelReader } from '$lib/testing/agent/fakes/in-memory-agent-model-reader';

const entry = {
	id: 'vendor/model',
	name: 'Model',
	supportedParameters: ['tools'],
	architecture: { inputModalities: ['text'] }
};

describe('model catalog reads', () => {
	it('reads the provider catalog on every call', async () => {
		const source = new InMemoryAgentModelReader([entry]);
		const catalog = new AgentModels(source, new Set());
		const first = (await catalog.list()).map((model) => model.id);
		source.entries = [];
		expect({ first, second: await catalog.list() }).toEqual({
			first: ['vendor/model'],
			second: []
		});
	});
	it('reports a provider failure as an external service error with its cause', async () => {
		const source = new InMemoryAgentModelReader([entry]);
		source.failure = new Error('Provider unavailable');
		await expect(new AgentModels(source, new Set()).list()).rejects.toMatchObject({
			name: 'ExternalServiceError',
			message: 'The model catalog could not be read.',
			cause: 'Provider unavailable'
		});
	});
});
