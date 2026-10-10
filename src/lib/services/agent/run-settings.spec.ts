import { expect, it } from 'vitest';
import { CHAT_WEB_SEARCH_DEFAULTS, REFERENCE_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import { AgentRunSettingsService } from './run-settings';
const settings = new AgentRunSettingsService();

it('lets each provider choose its own search, with the established chat budget, when no override is selected', () => {
	expect(settings.research({}, CHAT_WEB_SEARCH_DEFAULTS)).toEqual({
		engine: 'auto',
		maxResults: 20,
		maxTotalResults: 40
	});
});

it('keeps the reference budget distinct when deployment configuration does not override it', () => {
	expect(settings.research({}, REFERENCE_WEB_SEARCH_DEFAULTS)).toEqual({
		engine: 'exa',
		maxResults: 8,
		maxTotalResults: 16
	});
});

it('overrides each setting independently without losing the other resolved defaults', () => {
	expect(
		settings.research(
			{ engine: 'perplexity', maxResults: 7 },
			{ engine: 'exa', maxResults: 20, maxTotalResults: 32 }
		)
	).toEqual({ engine: 'perplexity', maxResults: 7, maxTotalResults: 32 });
});
it('prefers a conversation execution mode', () => {
	const mode = settings.executionMode(
		{ executionModeOverride: 'auto_accept' },
		{ executionMode: 'approval_required' }
	);
	expect(mode).toBe('auto_accept');
});

it('uses the account execution mode when a conversation has no override', () => {
	expect(settings.executionMode({}, { executionMode: 'auto_accept' })).toBe('auto_accept');
});
