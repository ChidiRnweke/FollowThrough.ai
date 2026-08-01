import { describe, expect, it } from 'vitest';
import type { OpenRouter } from '@openrouter/sdk';
import type { AgentPreferences, Conversation } from '$lib/models/agent';
import {
	AgentModels,
	resolveAgentExecutionMode,
	resolveAgentModel,
	resolveVisionModel
} from './preferences';

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

const catalog = (list: () => Promise<unknown>, ttlMs = 300_000) =>
	new AgentModels(
		{ models: { list } } as unknown as OpenRouter,
		new Set(['vendor/tool-model']),
		ttlMs
	);

describe('Agent model selection invariants', () => {
	it('prefers a conversation model over user and environment defaults', () => {
		const model = resolveAgentModel(
			{ modelOverride: 'conversation/model' } as Conversation,
			{ defaultModel: 'user/model' } as AgentPreferences,
			'environment/model'
		);
		expect(model).toBe('conversation/model');
	});

	it('uses the user model when there is no conversation override', () => {
		const model = resolveAgentModel(
			{} as Conversation,
			{ defaultModel: 'user/model' } as AgentPreferences,
			'environment/model'
		);
		expect(model).toBe('user/model');
	});

	it('uses the environment model when there is no persisted selection', () => {
		const model = resolveAgentModel(
			{} as Conversation,
			{} as AgentPreferences,
			'environment/model'
		);
		expect(model).toBe('environment/model');
	});

	it('normalizes legacy colon-form OpenRouter model identifiers', () => {
		const model = resolveAgentModel(
			{} as Conversation,
			{} as AgentPreferences,
			'deepseek:deepseek-v4-flash'
		);
		expect(model).toBe('deepseek/deepseek-v4-flash');
	});

	it('prefers a conversation execution mode', () => {
		const mode = resolveAgentExecutionMode(
			{ executionModeOverride: 'auto_accept' } as Conversation,
			{ executionMode: 'approval_required' } as AgentPreferences
		);
		expect(mode).toBe('auto_accept');
	});

	it('prefers a conversation vision model over the user default', () => {
		expect(
			resolveVisionModel(
				{ visionModelOverride: 'vision/conversation' },
				{ defaultVisionModel: 'vision/user' },
				'vision/environment'
			)
		).toBe('vision/conversation');
	});
});

describe('OpenRouter catalog invariants', () => {
	it('caches a successful catalog response', async () => {
		let requests = 0;
		const models = catalog(async () => {
			requests += 1;
			return modelResponse;
		});
		await models.list();
		await models.list();
		expect(requests).toBe(1);
	});

	it('retains stale models during a transient refresh failure', async () => {
		let requests = 0;
		const models = catalog(async () => {
			requests += 1;
			if (requests > 1) throw new Error('Temporary OpenRouter failure');
			return modelResponse;
		}, 0);
		const first = await models.list();
		const stale = await models.list();
		expect(stale).toEqual(first);
	});

	it('marks models without tool support as unavailable', async () => {
		const models = await catalog(async () => modelResponse).list();
		expect(models.find((model) => model.id === 'vendor/text-model')?.supportsTools).toBe(false);
	});

	it('derives native vision support from input modalities', async () => {
		const models = await catalog(async () => modelResponse).list();
		expect(models.find((model) => model.id === 'vendor/tool-model')?.supportsVision).toBe(true);
	});

	it('rejects a newly selected model without tool support', async () => {
		const models = catalog(async () => modelResponse);
		await expect(models.assertSelectable('vendor/text-model')).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('places recommended models before the full catalog', async () => {
		const models = await catalog(async () => modelResponse).list();
		expect(models[0]?.id).toBe('vendor/tool-model');
	});
});
