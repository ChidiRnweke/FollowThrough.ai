import { describe, expect, it } from 'vitest';
import type { NamedModel } from '$lib/models/agent/model-label';
import { ModelPresentationService } from '$lib/services/agent/model-label';
const { effectiveModel, modelMatchesQuery, modelMetaLine, shortModelName } =
	new ModelPresentationService();

const sonnet: NamedModel = {
	id: 'anthropic/claude-sonnet-4.5',
	name: 'Anthropic: Claude Sonnet 4.5',
	provider: 'anthropic'
};

const flash: NamedModel = {
	id: 'deepseek/deepseek-v4-flash',
	name: 'DeepSeek: V4 Flash',
	provider: 'deepseek'
};

const catalogue = [sonnet, flash];

describe('shortModelName', () => {
	it('drops the vendor a reader already knows from the model itself', () => {
		expect(shortModelName('Anthropic: Claude Sonnet 4.5')).toBe('Claude Sonnet 4.5');
	});

	it('keeps a name that names no vendor', () => {
		expect(shortModelName('Kimi K3')).toBe('Kimi K3');
	});

	/**
	 * A model the catalogue does not carry arrives as a bare id — a deployment
	 * default this account cannot list, say. Its last segment is the closest thing
	 * to a name that exists, and is better than showing the reader nothing.
	 */
	it('reduces a bare model id to its last segment', () => {
		expect(shortModelName('deepseek/deepseek-v4-flash')).toBe('deepseek-v4-flash');
	});
});

describe('effectiveModel', () => {
	it('reports a chat that chose its own model as having chosen it', () => {
		const model = effectiveModel(catalogue, sonnet.id, flash.id);
		expect({ source: model.source, label: model.label }).toEqual({
			source: 'conversation',
			label: 'Claude Sonnet 4.5'
		});
	});

	it('reports a chat that chose nothing as running on the workspace default', () => {
		const model = effectiveModel(catalogue, null, flash.id);
		expect({ source: model.source, label: model.label }).toEqual({
			source: 'workspace',
			label: 'V4 Flash'
		});
	});

	it('still labels a model the catalogue does not carry', () => {
		expect(effectiveModel(catalogue, null, 'openai/gpt-5.6').label).toBe('gpt-5.6');
	});
});

describe('context window presentation', () => {
	it('says a million-token window in the unit a reader compares', () => {
		expect(
			modelMetaLine({
				...sonnet,
				contextLength: 1_048_576,
				supportsTools: true,
				supportsVision: false
			})
		).toBe('anthropic · 1M context');
	});

	it('keeps one decimal where the difference between models is in it', () => {
		expect(
			modelMetaLine({
				...sonnet,
				contextLength: 1_500_000,
				supportsTools: true,
				supportsVision: false
			})
		).toBe('anthropic · 1.5M context');
	});

	it('drops the decimal once the number is large enough not to need it', () => {
		expect(
			modelMetaLine({
				...sonnet,
				contextLength: 20_000_000,
				supportsTools: true,
				supportsVision: false
			})
		).toBe('anthropic · 20M context');
	});

	it('reports a smaller window in thousands', () => {
		expect(
			modelMetaLine({
				...sonnet,
				contextLength: 128_000,
				supportsTools: true,
				supportsVision: false
			})
		).toBe('anthropic · 128K context');
	});
});

describe('modelMetaLine', () => {
	const described = {
		...sonnet,
		contextLength: 200_000,
		supportsTools: true,
		supportsVision: true
	};

	it('leads with the vendor the title no longer repeats', () => {
		expect(modelMetaLine(described)).toBe('anthropic · 200K context · sees images');
	});

	/**
	 * A row is a list item, not a property panel: an em dash where the catalogue
	 * carries no context length is noise that reads as content.
	 */
	it('omits a context length the catalogue does not carry', () => {
		expect(modelMetaLine({ ...described, contextLength: undefined })).toBe(
			'anthropic · sees images'
		);
	});

	it('warns that a model cannot call tools, which is why it is unselectable', () => {
		expect(modelMetaLine({ ...described, supportsTools: false })).toContain('no tools');
	});
});

describe('modelMatchesQuery', () => {
	it('matches on the display name', () => {
		expect(modelMatchesQuery(sonnet, 'sonnet')).toBe(true);
	});

	it('matches on the model id, which is what a reader pastes', () => {
		expect(modelMatchesQuery(flash, 'deepseek/deepseek-v4')).toBe(true);
	});

	it('rejects a model nothing in its name, provider or id matches', () => {
		expect(modelMatchesQuery(sonnet, 'llama')).toBe(false);
	});
});
