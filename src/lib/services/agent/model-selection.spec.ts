import { describe, expect, it } from 'vitest';
import {
	resolveAgentModel,
	resolveVisionModel,
	configuredAgentModels,
	configuredChatModels,
	resolveAttachmentVisionModel
} from './model-selection';

describe('Agent model selection invariants', () => {
	it('prefers a conversation model over user and environment defaults', () => {
		const model = resolveAgentModel(
			{ modelOverride: 'conversation/model' },
			{ defaultModel: 'user/model' },
			'environment/model'
		);
		expect(model).toBe('conversation/model');
	});

	it('uses the user model when there is no conversation override', () => {
		const model = resolveAgentModel({}, { defaultModel: 'user/model' }, 'environment/model');
		expect(model).toBe('user/model');
	});

	it('uses the environment model when there is no persisted selection', () => {
		const model = resolveAgentModel({}, {}, 'environment/model');
		expect(model).toBe('environment/model');
	});

	it('normalizes legacy colon-form OpenRouter model identifiers', () => {
		const model = resolveAgentModel({}, {}, 'deepseek:deepseek-v4-flash');
		expect(model).toBe('deepseek/deepseek-v4-flash');
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

it('keeps configured chat and vision models selectable outside the catalog', () => {
	expect(
		configuredAgentModels([], { chatModelId: 'custom/chat', visionModelId: 'custom/vision' }).map(
			(model) => model.id
		)
	).toEqual(['custom/chat', 'custom/vision']);
});
it('does not duplicate a model configured for both roles', () => {
	expect(
		configuredAgentModels([], { chatModelId: 'custom/shared', visionModelId: 'custom/shared' }).map(
			(model) => model.id
		)
	).toEqual(['custom/shared']);
});

it('retains declared vision support when bootstrap adds a model configured for both roles', () => {
	expect(
		configuredChatModels([], { chatModelId: 'custom/shared', visionModelId: 'custom/shared' })
	).toEqual([
		{
			id: 'custom/shared',
			name: 'custom/shared',
			provider: 'custom',
			supportsTools: true,
			supportsVision: true,
			recommended: false,
			capabilities: ['configured']
		}
	]);
});

it('uses the attachment override independently of chat and conversation models', () => {
	expect(
		resolveAttachmentVisionModel(
			{ attachmentVisionModel: 'vision:attachment' },
			'vision/environment'
		)
	).toBe('vision/attachment');
});
it('uses the deployment attachment model when no attachment override exists', () => {
	expect(resolveAttachmentVisionModel({}, 'vision/environment')).toBe('vision/environment');
});
it('preserves provider metadata when a configured model is already in the catalog', () => {
	const model = {
		id: 'vendor/known',
		name: 'Known',
		provider: 'vendor',
		supportsTools: true,
		supportsVision: true,
		recommended: true,
		capabilities: ['tools', 'vision']
	};
	expect(
		configuredAgentModels([model], { chatModelId: model.id, visionModelId: model.id })
	).toEqual([model]);
});
