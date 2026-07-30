import { describe, expect, it } from 'vitest';
import {
	openRouterWebSearchTool,
	webSearchOptionsFromEnvironment,
	withWebResearch
} from './web-research';

class RecordingFetch {
	body: unknown;

	fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		this.body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		return new Response('{}', { status: 200 });
	};
}

describe('OpenRouter web search transport', () => {
	it('preserves function tools when web search is enabled', async () => {
		const recorder = new RecordingFetch();
		const fetch = withWebResearch(recorder.fetch);
		await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			body: JSON.stringify({ tools: [{ type: 'function', function: { name: 'get_project' } }] })
		});
		expect(recorder.body).toEqual({
			tools: [
				{ type: 'function', function: { name: 'get_project' } },
				{
					type: 'openrouter:web_search',
					parameters: { engine: 'exa', max_results: 8, max_total_results: 16 }
				}
			]
		});
	});

	it('does not duplicate an existing web search tool', async () => {
		const recorder = new RecordingFetch();
		const fetch = withWebResearch(recorder.fetch);
		await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			body: JSON.stringify({ tools: [openRouterWebSearchTool()] })
		});
		const tools = (recorder.body as { tools: unknown[] }).tools;
		expect(tools).toHaveLength(1);
	});

	it('leaves non-chat requests unchanged', async () => {
		const recorder = new RecordingFetch();
		const fetch = withWebResearch(recorder.fetch);
		await fetch('https://openrouter.ai/api/v1/models', {
			method: 'POST',
			body: JSON.stringify({ request: 'unchanged' })
		});
		expect(recorder.body).toEqual({ request: 'unchanged' });
	});
});

describe('Reading web search settings from the environment', () => {
	it('retrieves page content by default rather than the model’s own snippets', () => {
		expect(openRouterWebSearchTool().parameters.engine).toBe('exa');
	});

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
