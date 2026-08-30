import { openRouterWebSearchTool, type WebResearchTool } from '$lib/models/agent';
import { z } from 'zod';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const webResearchRequestSchema = z.looseObject({
	tools: z.array(z.looseObject({ type: z.string() })).optional()
});

const requestUrl = (input: string | URL | Request): URL =>
	new URL(input instanceof Request ? input.url : input.toString());

const appendWebSearchTool = (body: string, tool: WebResearchTool): string => {
	const request = webResearchRequestSchema.parse(JSON.parse(body));
	const tools = request.tools ?? [];
	if (!tools.some((candidate) => candidate.type === tool.type))
		tools.push({ type: tool.type, parameters: { ...tool.parameters } });
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
