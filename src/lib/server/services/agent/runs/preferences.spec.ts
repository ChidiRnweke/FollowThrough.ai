import { ModelCatalogStore } from '$lib/server/stores/agent/model-catalog';
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
			new Set(['vendor/tool-model']),
			new ModelCatalogStore()
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
