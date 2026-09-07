import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { AgentModel, AgentPreferences, UpdateAgentPreferencesInput } from '$lib/models/agent';
import type {
	AgentModelCatalog,
	AgentPreferencesStore
} from '$lib/server/services/agent/runs/preferences';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
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

/** What the deployment falls back to when the user has chosen nothing. */
const DEPLOYMENT_CHAT_MODEL = 'deepseek/deepseek-v4-flash';
const DEPLOYMENT_VISION_MODEL = 'mistral/pixtral-large';

const setup = () => {
	const preferences = new FakeAgentPreferencesStore();
	const models = new FakeAgentModelCatalog();
	return {
		preferences,
		models,
		controller: new AgentSettings({
			preferences,
			models,
			defaultModel: DEPLOYMENT_CHAT_MODEL,
			defaultVisionModel: DEPLOYMENT_VISION_MODEL
		})
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

/**
 * The composer names this model on screen. It has to be resolved here because the
 * last link in the chain is deployment configuration the browser cannot read, and
 * a client guessing at it would label a model no run actually uses.
 */
describe('agent settings model defaults', () => {
	it('falls back to the deployment chat model when the user has chosen none', async () => {
		const { controller } = setup();
		expect((await controller.resolveDefaults(testActor())).chatModelId).toBe(DEPLOYMENT_CHAT_MODEL);
	});

	it('prefers the user default chat model over the deployment one', async () => {
		const { controller } = setup();
		await controller.updatePreferences(testActor(), { defaultModel: 'vendor/tool-model' });
		expect((await controller.resolveDefaults(testActor())).chatModelId).toBe('vendor/tool-model');
	});

	it('falls back to the deployment vision model when the user has chosen none', async () => {
		const { controller } = setup();
		expect((await controller.resolveDefaults(testActor())).visionModelId).toBe(
			DEPLOYMENT_VISION_MODEL
		);
	});
});

describe('offline bootstrap deployment defaults', () => {
	it('keeps deployment models independent of the users current overrides', async () => {
		const { controller } = setup();
		await controller.updatePreferences(testActor(), { defaultModel: 'vendor/tool-model' });
		expect(await controller.deploymentDefaults(testActor())).toEqual({
			chatModelId: DEPLOYMENT_CHAT_MODEL,
			visionModelId: DEPLOYMENT_VISION_MODEL
		});
	});
});
