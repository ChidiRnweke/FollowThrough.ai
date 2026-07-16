export interface OpenRouterWebSearchToolOptions {
	readonly engine?: 'auto' | 'native' | 'exa' | 'firecrawl' | 'parallel' | 'perplexity';
	readonly maxResults?: number;
	readonly maxTotalResults?: number;
}

export interface OpenRouterWebSearchTool {
	readonly type: 'openrouter:web_search';
	readonly parameters: {
		readonly engine: NonNullable<OpenRouterWebSearchToolOptions['engine']>;
		readonly max_results: number;
		readonly max_total_results: number;
	};
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const openRouterWebSearchTool = (
	options: OpenRouterWebSearchToolOptions = {}
): OpenRouterWebSearchTool => ({
	type: 'openrouter:web_search',
	parameters: {
		engine: options.engine ?? 'auto',
		max_results: options.maxResults ?? 3,
		max_total_results: options.maxTotalResults ?? 6
	}
});

const requestUrl = (input: string | URL | Request): URL =>
	new URL(input instanceof Request ? input.url : input.toString());

const appendWebSearchTool = (body: string, tool: OpenRouterWebSearchTool): string => {
	const request = JSON.parse(body) as { tools?: unknown };
	const tools = Array.isArray(request.tools) ? request.tools : [];
	if (
		!tools.some(
			(candidate) =>
				typeof candidate === 'object' &&
				candidate !== null &&
				(candidate as { type?: unknown }).type === tool.type
		)
	)
		tools.push(tool);
	return JSON.stringify({ ...request, tools });
};

export const withOpenRouterWebSearch =
	(delegate: Fetch = globalThis.fetch, tool = openRouterWebSearchTool()): Fetch =>
	async (input, init) => {
		if (!requestUrl(input).pathname.endsWith('/chat/completions') || typeof init?.body !== 'string')
			return delegate(input, init);
		return delegate(input, { ...init, body: appendWebSearchTool(init.body, tool) });
	};
