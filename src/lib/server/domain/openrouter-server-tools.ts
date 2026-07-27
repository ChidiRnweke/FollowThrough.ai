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

const ENGINES = ['auto', 'native', 'exa', 'firecrawl', 'parallel', 'perplexity'] as const;

type Engine = NonNullable<OpenRouterWebSearchToolOptions['engine']>;

const engineFrom = (value: string | undefined): Engine | undefined =>
	ENGINES.includes(value as Engine) ? (value as Engine) : undefined;

const positiveIntegerFrom = (value: string | undefined): number | undefined => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Read the search configuration from the environment.
 *
 * Deliberately tolerant: an unset or nonsense value falls back to the default rather than
 * failing the request, because a typo in one setting should not take web search offline.
 */
export const webSearchOptionsFromEnvironment = (
	environment: Readonly<Record<string, string | undefined>>
): OpenRouterWebSearchToolOptions => ({
	...(engineFrom(environment.OPENROUTER_WEB_SEARCH_ENGINE)
		? { engine: engineFrom(environment.OPENROUTER_WEB_SEARCH_ENGINE) as Engine }
		: {}),
	...(positiveIntegerFrom(environment.OPENROUTER_WEB_SEARCH_MAX_RESULTS)
		? { maxResults: positiveIntegerFrom(environment.OPENROUTER_WEB_SEARCH_MAX_RESULTS) as number }
		: {}),
	...(positiveIntegerFrom(environment.OPENROUTER_WEB_SEARCH_MAX_TOTAL_RESULTS)
		? {
				maxTotalResults: positiveIntegerFrom(
					environment.OPENROUTER_WEB_SEARCH_MAX_TOTAL_RESULTS
				) as number
			}
		: {})
});

export const openRouterWebSearchTool = (
	options: OpenRouterWebSearchToolOptions = {}
): OpenRouterWebSearchTool => ({
	type: 'openrouter:web_search',
	parameters: {
		// Exa retrieves page content where 'auto' falls back to the model's own native
		// search and its snippet-sized results; the caps are raised to match, since three
		// results is too thin a base for anything research-shaped.
		engine: options.engine ?? 'exa',
		max_results: options.maxResults ?? 8,
		max_total_results: options.maxTotalResults ?? 16
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
