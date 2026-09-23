import { expect, it } from 'vitest';
import { CHAT_WEB_SEARCH_DEFAULTS, REFERENCE_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import { resolveWebResearch } from './web-research';

it('uses page content and the established chat budget when no override is selected', () => {
	expect(resolveWebResearch({}, CHAT_WEB_SEARCH_DEFAULTS)).toEqual({
		engine: 'exa',
		maxResults: 20,
		maxTotalResults: 40
	});
});

it('keeps the reference budget distinct when deployment configuration does not override it', () => {
	expect(resolveWebResearch({}, REFERENCE_WEB_SEARCH_DEFAULTS)).toEqual({
		engine: 'exa',
		maxResults: 8,
		maxTotalResults: 16
	});
});

it('overrides each setting independently without losing the other resolved defaults', () => {
	expect(
		resolveWebResearch(
			{ engine: 'perplexity', maxResults: 7 },
			{ engine: 'exa', maxResults: 20, maxTotalResults: 32 }
		)
	).toEqual({ engine: 'perplexity', maxResults: 7, maxTotalResults: 32 });
});
