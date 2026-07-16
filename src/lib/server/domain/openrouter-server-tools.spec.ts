import { describe, expect, it } from 'vitest';
import { openRouterWebSearchTool, withOpenRouterWebSearch } from './openrouter-server-tools';

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
		const fetch = withOpenRouterWebSearch(recorder.fetch);
		await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			body: JSON.stringify({ tools: [{ type: 'function', function: { name: 'get_project' } }] })
		});
		expect(recorder.body).toEqual({
			tools: [
				{ type: 'function', function: { name: 'get_project' } },
				{
					type: 'openrouter:web_search',
					parameters: { engine: 'auto', max_results: 3, max_total_results: 6 }
				}
			]
		});
	});

	it('does not duplicate an existing web search tool', async () => {
		const recorder = new RecordingFetch();
		const fetch = withOpenRouterWebSearch(recorder.fetch);
		await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			body: JSON.stringify({ tools: [openRouterWebSearchTool()] })
		});
		const tools = (recorder.body as { tools: unknown[] }).tools;
		expect(tools).toHaveLength(1);
	});

	it('leaves non-chat requests unchanged', async () => {
		const recorder = new RecordingFetch();
		const fetch = withOpenRouterWebSearch(recorder.fetch);
		await fetch('https://openrouter.ai/api/v1/models', {
			method: 'POST',
			body: JSON.stringify({ request: 'unchanged' })
		});
		expect(recorder.body).toEqual({ request: 'unchanged' });
	});
});
