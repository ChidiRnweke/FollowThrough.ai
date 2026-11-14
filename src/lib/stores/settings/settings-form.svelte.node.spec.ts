import { describe, expect, it } from 'vitest';
import { createSettingsForm } from '$lib/factories/settings/settings-form';

type ModelSettings = {
	readonly defaultModel: string | null;
	readonly inlineModel: string | null;
	readonly inlineSuggestionsEnabled: boolean;
};

const saved: ModelSettings = {
	defaultModel: 'openai/gpt-5.6-luna',
	inlineModel: null,
	inlineSuggestionsEnabled: true
};

describe('settings form', () => {
	it('reports nothing unsaved once an edited value is set back to its saved one', () => {
		const form = createSettingsForm(saved);
		form.set('inlineSuggestionsEnabled', false);
		form.set('inlineSuggestionsEnabled', true);
		expect(form.dirty).toBe(false);
	});

	it('puts every edited value back to its saved one on undo', () => {
		const form = createSettingsForm(saved);
		form.set('defaultModel', 'anthropic/claude-sonnet-5.5');
		form.set('inlineModel', 'mistral/mistral-small-3.2');
		form.undo();
		expect({ values: form.values, dirty: form.dirty }).toEqual({ values: saved, dirty: false });
	});

	it('keeps an edit made after submitting unsaved once the submitted values are saved', () => {
		const form = createSettingsForm(saved);
		form.set('defaultModel', 'anthropic/claude-sonnet-5.5');
		const submitted = form.values;
		form.set('inlineModel', 'mistral/mistral-small-3.2');
		form.commit(submitted);
		form.undo();
		expect({ values: form.values, dirty: form.dirty }).toEqual({
			values: { ...saved, defaultModel: 'anthropic/claude-sonnet-5.5' },
			dirty: false
		});
	});
});
