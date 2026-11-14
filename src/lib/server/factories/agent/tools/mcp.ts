import { ValidationError } from '$lib/errors';
import type {
	AgentTool,
	McpToolSession,
	PreparedAction,
	ToolPreparation
} from '$lib/models/agent-tool-protocol';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import { toolFailure } from '$lib/models/agent/tool-failure';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { jsonObjectSchema, withToolFeedback } from '$lib/server/infrastructure/agents/sdk-tool';
import { bindToolArguments, toolOutput } from './arguments';
import { describeTools } from './catalog';

export interface McpToolConnection {
	/** Serve the session; `origin` is where this deployment is reached, which its icons live under. */
	open(origin: string): Server;
}

const searchParameters = z
	.object({ query: z.string().min(1), limit: z.number().int().min(1).max(15).optional() })
	.strict();
const SEARCH_DESCRIPTION =
	'Find the FollowThrough tool for an intent. Every tool is already listed; call the match by its exact name with flat arguments matching input_schema.';

/**
 * The same tools the in-app agent calls, served over MCP for one request. An MCP host makes
 * its own approval decisions, so calls run as soon as they are authorized.
 */
/**
 * Who this server is, as an MCP host shows it. The icons are the app's own: without them a host
 * falls back to a favicon lookup, and the root of a subdomain deployment answers that with the
 * parent domain's icon.
 */
const serverIdentity = (origin: string) => ({
	name: 'followthrough',
	title: 'FollowThrough',
	version: '1.0.0',
	websiteUrl: origin,
	icons: [
		{ src: new URL('/icons/followthrough.svg', origin).href, mimeType: 'image/svg+xml' },
		{
			src: new URL('/icons/followthrough-512.png', origin).href,
			mimeType: 'image/png',
			sizes: ['512x512']
		}
	]
});

const ready = (action: PreparedAction): ToolPreparation => ({ kind: 'ready', action });

/** An MCP host approves its own calls, so a reviewed change is applied as soon as it is prepared. */
const prepareCall = async (entry: AgentTool, input: AgentPayload): Promise<ToolPreparation> => {
	if (entry.kind === 'direct') return ready(entry.prepare(input));
	const prepared = await entry.review.prepare(input, undefined);
	if (prepared.kind === 'failure') return prepared.failure;
	return ready({ arguments: prepared.arguments, execute: prepared.apply });
};

export const createMcpServer = (session: McpToolSession): McpToolConnection => ({
	open: (origin) => {
		// Every permitted tool is listed. The endpoint is stateless, so a tool promoted during one
		// request would be gone by the next, and a host that reads `tools/list` once at session
		// start would never see it anyway (ADR 0051).
		const permitted = [...session.plan.initial, ...session.plan.discoverable].flatMap((name) => {
			const entry = session.tools.find((candidate) => candidate.name === name);
			return entry ? [entry] : [];
		});
		const server = new Server(serverIdentity(origin), {
			capabilities: { tools: {} },
			instructions:
				'Ground yourself with search or get_workspace_context before acting. Every FollowThrough tool is listed; use search_tools to find the right one for an intent, then call it by its exact name with flat arguments matching input_schema.'
		});
		server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: [
				...permitted.map((entry) => ({
					name: entry.name,
					description: entry.description,
					inputSchema: jsonObjectSchema(entry.parameters),
					annotations: {
						readOnlyHint: entry.classification === 'read',
						destructiveHint: entry.classification === 'mutation'
					}
				})),
				{
					name: 'search_tools',
					description: SEARCH_DESCRIPTION,
					inputSchema: jsonObjectSchema(searchParameters),
					annotations: { readOnlyHint: true, destructiveHint: false }
				}
			]
		}));
		server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
			const { name, arguments: input = {} } = request.params;
			// Every listed name has a permitted entry; `search_tools` has none.
			const entry = permitted.find((candidate) => candidate.name === name);
			if (name !== 'search_tools' && entry === undefined)
				return result(
					toolFailure(
						'TOOL_NOT_AVAILABLE',
						`Tool "${name}" is not available.`,
						'Use search_tools to find an available capability.'
					)
				);
			const prepared = await withToolFeedback(extra.signal, async (): Promise<ToolPreparation> => {
				const payload = agentPayloadResultSchema.parse(input);
				if (payload.kind === 'corrupt') throw new ValidationError(payload.message);
				if (entry === undefined)
					return ready(
						bindToolArguments(searchParameters, payload.value, async ({ query, limit }) => {
							return describeTools(permitted, [], await session.discover(query, limit ?? 5));
						})
					);
				return prepareCall(entry, payload.value);
			});
			if (prepared.kind === 'failure') return result(prepared);
			const { action } = prepared;
			const value = await withToolFeedback(extra.signal, async () =>
				toolOutput(await action.execute(extra.signal))
			);
			return result(value);
		});
		return server;

		function result(value: AgentPayload) {
			return {
				...(session.failed(value) ? { isError: true } : {}),
				content: [{ type: 'text' as const, text: JSON.stringify(value) }]
			};
		}
	}
});
