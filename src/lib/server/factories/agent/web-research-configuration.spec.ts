import { describe, expect, it } from 'vitest';
import { webSearchOptionsFromEnvironment } from './web-research-configuration';

describe('Reading web search settings from the environment', () => {
	it('honours a configured engine', () => {
		expect(webSearchOptionsFromEnvironment({ OPENROUTER_WEB_SEARCH_ENGINE: 'perplexity' })).toEqual(
			{ engine: 'perplexity' }
		);
	});

	/** A typo in one setting must not take web search offline. */
	it('ignores an engine it does not recognise', () => {
		expect(webSearchOptionsFromEnvironment({ OPENROUTER_WEB_SEARCH_ENGINE: 'gogle' })).toEqual({});
	});

	it('honours a configured result cap', () => {
		expect(webSearchOptionsFromEnvironment({ OPENROUTER_WEB_SEARCH_MAX_RESULTS: '12' })).toEqual({
			maxResults: 12
		});
	});

	it('ignores a non-numeric result cap', () => {
		expect(webSearchOptionsFromEnvironment({ OPENROUTER_WEB_SEARCH_MAX_RESULTS: 'lots' })).toEqual(
			{}
		);
	});

	it('ignores a zero result cap rather than disabling search', () => {
		expect(webSearchOptionsFromEnvironment({ OPENROUTER_WEB_SEARCH_MAX_RESULTS: '0' })).toEqual({});
	});

	it('falls back to the defaults when nothing is configured', () => {
		expect(webSearchOptionsFromEnvironment({})).toEqual({});
	});
});
