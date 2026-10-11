import { describe, expect, it } from 'vitest';
import { InMemoryAgentModelReader } from '$lib/testing/agent/fakes/in-memory-agent-model-reader';
import { AgentModels } from './preferences';

const modelResponse = {
	data: [
		{
			id: 'vendor/tool-model',
			name: 'Tool Model',
			contextLength: 128_000,
			supportedParameters: ['tools', 'reasoning'],
			architecture: { inputModalities: ['text', 'image'] }
		},
		{
			id: 'vendor/text-model',
			name: 'Text Model',
			contextLength: 32_000,
			supportedParameters: [],
			architecture: { inputModalities: ['text'] }
		}
	]
};

describe('OpenRouter catalog invariants', () => {
	it('projects tool support, vision capability, and recommended ordering from one catalog response', async () => {
		const models = await new AgentModels(
			new InMemoryAgentModelReader(modelResponse.data),
			new Set(['vendor/tool-model'])
		).list();
		expect({
			firstId: models[0]?.id,
			textModelSupportsTools: models.find((model) => model.id === 'vendor/text-model')
				?.supportsTools,
			toolModelSupportsVision: models.find((model) => model.id === 'vendor/tool-model')
				?.supportsVision
		}).toEqual({
			firstId: 'vendor/tool-model',
			textModelSupportsTools: false,
			toolModelSupportsVision: true
		});
	});
});

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
