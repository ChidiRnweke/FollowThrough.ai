import { describe, expect, it } from 'vitest';
import type { AgentPreferences } from '$lib/models/agent';
import { AgentPreferenceEditingService } from './preferences';
const editing = new AgentPreferenceEditingService();
import type { DateTime } from '$lib/models/workspace';
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
		expect(editing.apply(current, { inlineSuggestionsEnabled: false }, testNow)).toEqual({
			...current,
			inlineSuggestionsEnabled: false
		});
	});
	it('clears an explicit null without clearing unrelated settings', () => {
		expect(
			editing.apply(current, { defaultModel: null, webSearchMaxResults: null }, testNow)
		).toEqual({ ...current, defaultModel: undefined, webSearchMaxResults: undefined });
	});
	it('uses the selected value and preserves creation time while advancing update time', () => {
		const timestamp = '2026-09-23T12:00:00.000Z' as DateTime;
		expect(
			editing.apply(current, { defaultModel: 'vendor/other', webSearchMaxResults: 15 }, timestamp)
		).toEqual({
			...current,
			defaultModel: 'vendor/other',
			webSearchMaxResults: 15,
			updatedAt: timestamp
		});
	});
});
