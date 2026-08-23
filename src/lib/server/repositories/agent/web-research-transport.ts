import { openRouterWebSearchTool, type WebResearchTool } from '$lib/models/agent';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const requestUrl = (input: string | URL | Request): URL =>
	new URL(input instanceof Request ? input.url : input.toString());

const appendWebSearchTool = (body: string, tool: WebResearchTool): string => {
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

/** Adds OpenRouter's server-side search tool at the HTTP boundary for both supported generation protocols. */
export const withWebResearch =
	(delegate: Fetch = globalThis.fetch, tool: WebResearchTool = openRouterWebSearchTool()): Fetch =>
	async (input, init) => {
		const pathname = requestUrl(input).pathname;
		if (
			(!pathname.endsWith('/chat/completions') && !pathname.endsWith('/responses')) ||
			typeof init?.body !== 'string'
		)
			return delegate(input, init);
		return delegate(input, { ...init, body: appendWebSearchTool(init.body, tool) });
	};
