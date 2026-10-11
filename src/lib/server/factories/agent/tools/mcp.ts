import { ToolLifecycleError } from '$lib/errors';
import type {
	AgentTool,
	McpToolSession,
	PreparedAction,
	ToolPreparation
} from '$lib/models/agent-tool-protocol';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import { toolFailure } from '$lib/models/agent/tool-failure';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { bindToolArguments, jsonObjectSchema, toolCallFailure, toolOutput } from './arguments';
import { describeTools } from './catalog';

export interface McpToolConnection {
	open(): Server;
}

const searchParameters = z
	.object({ query: z.string().min(1), limit: z.number().int().min(1).max(15).optional() })
	.strict();
const SEARCH_DESCRIPTION =
	'Find more FollowThrough tools. Every match becomes a top-level tool; call its exact name with flat arguments matching input_schema.';

/**
 * The same tools the in-app agent calls, served over MCP for one request. An MCP host makes
 * its own approval decisions, so calls run as soon as they are authorized.
 */
const ready = (action: PreparedAction): ToolPreparation => ({ kind: 'ready', action });

/** An MCP host approves its own calls, so a reviewed change is applied as soon as it is prepared. */
const prepareCall = async (entry: AgentTool, input: AgentPayload): Promise<ToolPreparation> => {
	if (entry.kind === 'direct') return ready(entry.prepare(input));
	const prepared = await entry.review.prepare(input, undefined);
	if (prepared.kind === 'failure') return { kind: 'failure', failure: prepared.failure };
	return ready({ arguments: prepared.arguments, execute: prepared.apply });
};

export const createMcpServer = (session: McpToolSession): McpToolConnection => ({
	open: () => {
		const discovered = new Set<ToolName>();
		const permitted = [...session.plan.initial, ...session.plan.discoverable].flatMap((name) => {
			const entry = session.tools.find((candidate) => candidate.name === name);
			return entry ? [entry] : [];
		});
		const offered = (): readonly AgentTool[] =>
			permitted.filter(
				(entry) => session.plan.initial.includes(entry.name) || discovered.has(entry.name)
			);
		const server = new Server(
			{ name: 'followthrough', version: '1.0.0' },
			{
				capabilities: { tools: { listChanged: true } },
				instructions:
					'Ground yourself with search or get_workspace_context before acting. Use search_tools to discover other tools, then call their exact names with flat arguments matching input_schema.'
			}
		);
		server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: [
				...offered().map((entry) => ({
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
			const payload = agentPayloadResultSchema.parse(input);
			if (payload.kind === 'corrupt') throw new ToolLifecycleError(payload.message);
			const value = await invoke(
				name,
				async () => {
					if (name === 'search_tools')
						return ready(
							bindToolArguments(searchParameters, payload.value, async ({ query, limit }) => {
								const found = await session.discover(query, limit ?? 5);
								for (const discoveredName of found) discovered.add(discoveredName);
								return describeTools(permitted, found);
							})
						);
					const entry = offered().find((candidate) => candidate.name === name);
					if (!entry)
						throw new ToolLifecycleError(
							'Registered MCP tool is absent from its permitted catalog'
						);
					return prepareCall(entry, payload.value);
				},
				extra.signal
			);
			if (name === 'search_tools' && !session.failed(value)) await server.sendToolListChanged();
			return {
				...(session.failed(value) ? { isError: true } : {}),
				content: [{ type: 'text' as const, text: JSON.stringify(value) }]
			};
		});
		return server;

		async function invoke(
			toolName: string,
			bind: () => Promise<ToolPreparation>,
			signal: AbortSignal
		): Promise<AgentPayload> {
			if (toolName !== 'search_tools' && !offered().some((entry) => entry.name === toolName))
				return toolFailure(
					'TOOL_NOT_AVAILABLE',
					`Tool "${toolName}" is not available.`,
					'Use search_tools to discover an available capability.'
				);
			signal.throwIfAborted();
			const prepared = await bind().catch((error: unknown): ToolPreparation => {
				signal.throwIfAborted();
				if (error instanceof ToolLifecycleError) throw error;
				return { kind: 'failure', failure: toolCallFailure(error) };
			});
			if (prepared.kind === 'failure') return prepared.failure;
			try {
				return toolOutput(await prepared.action.execute());
			} catch (error) {
				signal.throwIfAborted();
				if (error instanceof ToolLifecycleError) throw error;
				return { ...toolCallFailure(error), kind: 'failure' };
			}
		}
	}
});
