import { expect, it } from 'vitest';
import { InMemoryModelCatalog } from '$lib/testing/agent/fakes/in-memory-model-catalog';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentSettings, type AgentSettingsDependencies } from './controller';

const setup = () => {
	const models = new InMemoryModelCatalog();
	const controller = new AgentSettings(
		capabilityDependencies<AgentSettingsDependencies>({
			models,
			defaultModel: 'test/chat',
			defaultVisionModel: 'test/vision',
			agentAvailable: false,
			webSearchDefaults: { engine: 'firecrawl', maxResults: 11, maxTotalResults: 23 }
		})
	);
	return { controller, models };
};

it('returns the resolved deployment budgets and availability for the authenticated bootstrap', async () => {
	const { controller } = setup();
	const result = await controller.bootstrap(testActor());
	expect({
		accountId: result.accountId,
		defaults: result.numericDefaults,
		available: result.agentAvailable
	}).toEqual({
		accountId: testActor().userId,
		defaults: { webSearchMaxResults: 11, webSearchMaxTotalResults: 23, agentMaxTurns: 20 },
		available: false
	});
});

it('does not return a successful bootstrap when the model catalog fails', async () => {
	const { controller, models } = setup();
	models.failure = new Error('Catalog unavailable');
	await expect(controller.bootstrap(testActor())).rejects.toThrow('Catalog unavailable');
});
