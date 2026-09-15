import { describe, expect, it } from 'vitest';
import { applyAgentPreferenceUpdate, type AgentPreferences } from './index';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const current: AgentPreferences = {
	userId: testActor().userId,
	defaultModel: 'vendor/model',
	inlineModel: 'vendor/inline',
	webSearchMaxResults: 10,
	executionMode: 'approval_required',
	inlineSuggestionsEnabled: true,
	createdAt: testNow,
	updatedAt: testNow
};

describe('partial preference edits', () => {
	it('retains omitted preferences while applying an explicit false', () => {
		expect(applyAgentPreferenceUpdate(current, { inlineSuggestionsEnabled: false })).toEqual({
			...current,
			inlineSuggestionsEnabled: false
		});
	});
	it('clears an explicit null without clearing unrelated settings', () => {
		expect(
			applyAgentPreferenceUpdate(current, { defaultModel: null, webSearchMaxResults: null })
		).toEqual({ ...current, defaultModel: undefined, webSearchMaxResults: undefined });
	});
	it('uses the selected value without changing the observed timestamps', () => {
		expect(
			applyAgentPreferenceUpdate(current, { defaultModel: 'vendor/other', webSearchMaxResults: 15 })
		).toEqual({ ...current, defaultModel: 'vendor/other', webSearchMaxResults: 15 });
	});
});
