import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import { describe, expect, it } from 'vitest';
import type { DateTime } from '$lib/models/workspace';
import { agentPreferenceWrite } from '$lib/controllers/workspace/commands';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { InMemoryAgentPreferencesRepository } from '$lib/testing/agent/fakes/in-memory-inline-completion';
import { InMemoryModelCatalog } from '$lib/testing/agent/fakes/in-memory-model-catalog';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { AgentSettings, type AgentSettingsDependencies } from './controller';

/** What the deployment falls back to when the user has chosen nothing. */
const DEPLOYMENT_CHAT_MODEL = 'deepseek/deepseek-v4-flash';
const DEPLOYMENT_VISION_MODEL = 'mistral/pixtral-large';
const timestamp = '2026-09-23T12:00:00.000Z' as DateTime;

const setup = () => {
	const repository = new InMemoryAgentPreferencesRepository();
	repository.entries.set(testActor().userId, {
		userId: testActor().userId,
		executionMode: 'approval_required',
		inlineSuggestionsEnabled: true,
		createdAt: testNow,
		updatedAt: testNow
	});
	const preferences = new AgentPreferenceCatalog(repository);
	const models = new InMemoryModelCatalog();
	models.models = [
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
	return {
		preferences,
		repository,
		models,
		controller: new AgentSettings(
			capabilityDependencies<AgentSettingsDependencies>({
				preferences,
				webSearchDefaults: CHAT_WEB_SEARCH_DEFAULTS,
				agentAvailable: true,
				transactionRunner: new InMemoryTransactionRunner([repository]),
				now: () => timestamp,
				models,
				defaultModel: DEPLOYMENT_CHAT_MODEL,
				defaultVisionModel: DEPLOYMENT_VISION_MODEL
			})
		)
	};
};

describe('agent settings controller behavior', () => {
	it.each([
		['defaultModel', DEPLOYMENT_CHAT_MODEL],
		['defaultVisionModel', DEPLOYMENT_VISION_MODEL],
		['attachmentVisionModel', DEPLOYMENT_VISION_MODEL],
		['inlineModel', DEPLOYMENT_CHAT_MODEL]
	] as const)(
		'accepts the configured deployment model for %s when the provider omits it',
		async (field, modelId) => {
			const { controller } = setup();
			expect((await controller.updatePreferences(testActor(), { [field]: modelId }))[field]).toBe(
				modelId
			);
		}
	);
	it('rejects a newly selected chat model without tool support', async () => {
		const { controller, models } = setup();
		models.models = [
			{
				id: 'vendor/text',
				name: 'Text',
				provider: 'vendor',
				supportsTools: false,
				supportsVision: false,
				recommended: false,
				capabilities: []
			}
		];
		await expect(
			controller.updatePreferences(testActor(), { defaultModel: 'vendor/text' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('reports a catalog failure instead of treating it as an empty catalog', async () => {
		const { controller, models } = setup();
		models.failure = new Error('Catalog unavailable');
		await expect(
			controller.updatePreferences(testActor(), { defaultModel: DEPLOYMENT_CHAT_MODEL })
		).rejects.toThrow('Catalog unavailable');
	});
	it('creates the first preferences with one timestamp and the requested settings', async () => {
		const { controller, repository } = setup();
		repository.entries.clear();
		expect(
			await controller.updatePreferences(testActor(), { inlineSuggestionsEnabled: false })
		).toEqual({
			userId: testActor().userId,
			executionMode: 'approval_required',
			inlineSuggestionsEnabled: false,
			createdAt: timestamp,
			updatedAt: timestamp
		});
	});
	it.each(['defaultVisionModel', 'attachmentVisionModel'] as const)(
		'rejects a non-vision model for %s',
		async (field) => {
			const { controller } = setup();
			await expect(
				controller.updatePreferences(testActor(), { [field]: 'vendor/tool-model' })
			).rejects.toThrow('cannot read images');
		}
	);
	it('allows a catalog model without tool support for inline completion', async () => {
		const { controller, models } = setup();
		models.models.push({
			id: 'vendor/completion',
			name: 'Completion',
			provider: 'vendor',
			supportsTools: false,
			supportsVision: false,
			recommended: false,
			capabilities: []
		});
		expect(
			(await controller.updatePreferences(testActor(), { inlineModel: 'vendor/completion' }))
				.inlineModel
		).toBe('vendor/completion');
	});
	it('rejects an unavailable inline model', async () => {
		const { controller } = setup();
		await expect(
			controller.updatePreferences(testActor(), { inlineModel: 'vendor/missing' })
		).rejects.toThrow('unavailable');
	});
	it('matches offline nullable edits while retaining unrelated fields', async () => {
		const { controller, repository, preferences } = setup();
		const current = {
			...(await preferences.get(testActor())),
			defaultModel: 'vendor/old',
			webSearchMaxResults: 12
		};
		repository.entries.set(testActor().userId, current);
		const patch = { defaultModel: null, inlineSuggestionsEnabled: false };
		const saved = await controller.updatePreferences(testActor(), patch);
		expect({ type: 'agent_preferences', value: saved }).toEqual(
			agentPreferenceWrite(current, patch, timestamp).local
		);
	});
	it('keeps another account’s preferences separate', async () => {
		const { controller, preferences } = setup();
		const original = await preferences.get(testActor());
		await controller.updatePreferences(testActor(2), { inlineSuggestionsEnabled: false });
		expect(await controller.getPreferences(testActor())).toEqual(original);
	});
	it('returns the persisted preferences', async () => {
		const { controller, preferences } = setup();
		expect(await controller.getPreferences(testActor())).toEqual(
			await preferences.get(testActor())
		);
	});

	it('includes the deployment chat model alongside provider models', async () => {
		const { controller, models } = setup();
		expect(await controller.listModels(testActor())).toEqual([
			...models.models,
			{
				id: DEPLOYMENT_CHAT_MODEL,
				name: DEPLOYMENT_CHAT_MODEL,
				provider: 'deepseek',
				supportsTools: true,
				supportsVision: false,
				recommended: false,
				capabilities: ['configured']
			}
		]);
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
		).rejects.toThrow('unavailable or does not support tools');
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
		expect((await controller.bootstrap(testActor())).agentDefaults).toEqual({
			chatModelId: DEPLOYMENT_CHAT_MODEL,
			visionModelId: DEPLOYMENT_VISION_MODEL
		});
	});
});
