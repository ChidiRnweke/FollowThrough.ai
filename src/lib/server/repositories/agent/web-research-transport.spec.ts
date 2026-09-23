import { describe, expect, it } from 'vitest';
import { openRouterWebSearchTool, CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import { withWebResearch } from './web-research-transport';

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
		const fetch = withWebResearch(
			recorder.fetch,
			openRouterWebSearchTool(CHAT_WEB_SEARCH_DEFAULTS)
		);
		await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			body: JSON.stringify({ tools: [{ type: 'function', function: { name: 'get_project' } }] })
		});
		expect(recorder.body).toEqual({
			tools: [
				{ type: 'function', function: { name: 'get_project' } },
				{
					type: 'openrouter:web_search',
					parameters: { engine: 'exa', max_results: 20, max_total_results: 40 }
				}
			]
		});
	});

	it('does not duplicate an existing web search tool', async () => {
		const recorder = new RecordingFetch();
		const fetch = withWebResearch(
			recorder.fetch,
			openRouterWebSearchTool(CHAT_WEB_SEARCH_DEFAULTS)
		);
		await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			body: JSON.stringify({ tools: [openRouterWebSearchTool(CHAT_WEB_SEARCH_DEFAULTS)] })
		});
		const tools = (recorder.body as { tools: unknown[] }).tools;
		expect(tools).toHaveLength(1);
	});

	it('adds web search to Responses API requests', async () => {
		const recorder = new RecordingFetch();
		const fetch = withWebResearch(
			recorder.fetch,
			openRouterWebSearchTool(CHAT_WEB_SEARCH_DEFAULTS)
		);
		await fetch('https://openrouter.ai/api/v1/responses', {
			method: 'POST',
			body: JSON.stringify({ model: 'openai/gpt-5.6', input: 'Research this' })
		});
		expect(recorder.body).toMatchObject({
			tools: [openRouterWebSearchTool(CHAT_WEB_SEARCH_DEFAULTS)]
		});
	});

	it('leaves non-chat requests unchanged', async () => {
		const recorder = new RecordingFetch();
		const fetch = withWebResearch(
			recorder.fetch,
			openRouterWebSearchTool(CHAT_WEB_SEARCH_DEFAULTS)
		);
		await fetch('https://openrouter.ai/api/v1/models', {
			method: 'POST',
			body: JSON.stringify({ request: 'unchanged' })
		});
		expect(recorder.body).toEqual({ request: 'unchanged' });
	});
});
