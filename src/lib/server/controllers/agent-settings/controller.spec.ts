import { describe, expect, it } from 'vitest';
import type {
	ActorContext,
	AgentModel,
	AgentPreferences,
	UpdateAgentPreferencesInput
} from '$lib/models';
import type { AgentModelCatalog, AgentPreferencesStore } from '$lib/server/services';
import { testActor, testNow } from '$lib/testing/fixtures/domain-builders';
import { AgentSettings } from './controller';

class FakeAgentPreferencesStore implements AgentPreferencesStore {
	preferences: AgentPreferences = {
		userId: testActor().userId,
		executionMode: 'approval_required',
		inlineSuggestionsEnabled: true,
		createdAt: testNow,
		updatedAt: testNow
	};

	async get(_actor: ActorContext): Promise<AgentPreferences> {
		void _actor;
		return this.preferences;
	}

	async update(
		_actor: ActorContext,
		input: UpdateAgentPreferencesInput
	): Promise<AgentPreferences> {
		this.preferences = {
			...this.preferences,
			...(input.defaultModel === null
				? { defaultModel: undefined }
				: input.defaultModel
					? { defaultModel: input.defaultModel }
					: {}),
			...(input.executionMode ? { executionMode: input.executionMode } : {}),
			...(input.inlineSuggestionsEnabled === undefined
				? {}
				: { inlineSuggestionsEnabled: input.inlineSuggestionsEnabled })
		};
		return this.preferences;
	}
}

class FakeAgentModelCatalog implements AgentModelCatalog {
	models: AgentModel[] = [
		{
			id: 'vendor/tool-model',
			name: 'Tool model',
			provider: 'vendor',
			supportsTools: true,
			supportsVision: false,
			recommended: true,
			capabilities: ['tools']
		}
	];

	async list(): Promise<readonly AgentModel[]> {
		return this.models;
	}

	async assertSelectable(modelId: string): Promise<void> {
		if (!this.models.some((model) => model.id === modelId))
			throw new Error('Model is not selectable');
	}
}

const setup = () => {
	const preferences = new FakeAgentPreferencesStore();
	const models = new FakeAgentModelCatalog();
	return {
		preferences,
		models,
		controller: new AgentSettings({ preferences, models })
	};
};

describe('agent settings controller behavior', () => {
	it('returns the persisted preferences', async () => {
		const { controller, preferences } = setup();
		expect(await controller.getPreferences(testActor())).toEqual(preferences.preferences);
	});

	it('returns the selectable model catalog', async () => {
		const { controller, models } = setup();
		expect(await controller.listModels(testActor())).toEqual(models.models);
	});

	it('persists a selectable default model', async () => {
		const { controller } = setup();
		const updated = await controller.updatePreferences(testActor(), {
			defaultModel: 'vendor/tool-model'
		});
		expect(updated.defaultModel).toBe('vendor/tool-model');
	});

	it('does not persist an unavailable default model', async () => {
		const { controller } = setup();
		await expect(
			controller.updatePreferences(testActor(), { defaultModel: 'missing/model' })
		).rejects.toThrow('Model is not selectable');
	});
});
