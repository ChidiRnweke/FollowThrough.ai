// chisel-ignore-file structural:factory-contains-logic -- MCP protocol adapter owns registration and wire results, not application composition.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import { toolFailure } from '$lib/models/agent/tool-failure';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import {
	McpTools,
	FIRST_CLASS_TOOL_NAMES,
	FIRST_CLASS_TOOL_SET,
	type AgentToolDefinition,
	type ToolAccessPolicy
} from './agent-tool-factory';
import {
	ToolLifecycleError,
	jsonObjectSchema,
	bindToolArguments,
	executeToolAction,
	prepareToolCall
} from './tool-call-boundary';

export interface McpToolSurfaceOptions {
	readonly controllers: ControllerFactory;
	readonly actor: ActorContext;
	readonly scope: ApiTokenScope;
	readonly provenanceId: ProvenanceId;
	readonly toolRetriever: ToolRetriever;
	readonly toolAccess: ToolAccessPolicy;
}

const result = (value: AgentPayload) => ({
	...(readToolFailure(value) === undefined ? {} : { isError: true }),
	content: [{ type: 'text' as const, text: JSON.stringify(value) }]
});

/** Validate inside our boundary, so schema errors and domain errors have one format. */
export const createMcpToolSurface = (options: McpToolSurfaceOptions): Server => {
	const registry = new McpTools(
		options.controllers,
		options.actor,
		{ provenanceId: options.provenanceId },
		options.toolAccess
	);
	const permitted = registry.definitions(
		options.scope === 'read' ? { classifications: ['read'] } : {}
	);
	const byName = new Map<string, AgentToolDefinition>(
		permitted.map((definition) => [definition.name, definition])
	);
	const registered = new Set<string>(FIRST_CLASS_TOOL_NAMES.filter((name) => byName.has(name)));
	const server = new Server(
		{ name: 'followthrough', version: '1.0.0' },
		{
			capabilities: { tools: { listChanged: true } },
			instructions:
				'Ground yourself with search or get_workspace_context before acting. Use search_tools to discover other tools, then call their exact names with flat arguments matching input_schema.'
		}
	);
	const searchParameters = z
		.object({ query: z.string().min(1), limit: z.number().int().min(1).max(15).optional() })
		.strict();
	const searchDescription =
		'Find more FollowThrough tools. Every match becomes a top-level tool; call its exact name with flat arguments matching input_schema.';
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [
			...permitted
				.filter((definition) => registered.has(definition.name))
				.map((definition) => ({
					name: definition.name,
					description: definition.description,
					inputSchema: jsonObjectSchema(definition.parameters),
					annotations: {
						readOnlyHint: definition.classification === 'read',
						destructiveHint: definition.classification === 'mutation'
					}
				})),
			{
				name: 'search_tools',
				description: searchDescription,
				inputSchema: jsonObjectSchema(searchParameters),
				annotations: { readOnlyHint: true, destructiveHint: false }
			}
		]
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const { name, arguments: input = {} } = request.params;
		if (name !== 'search_tools' && !registered.has(name))
			return result(
				toolFailure(
					'TOOL_NOT_AVAILABLE',
					`Tool "${name}" is not available.`,
					'Use search_tools to discover an available capability.'
				)
			);
		const prepared = await prepareToolCall(async () => {
			if (name === 'search_tools')
				return {
					kind: 'ready',
					action: bindToolArguments(searchParameters, input, async ({ query, limit }) => {
						const catalog = permitted
							.filter((definition) => !FIRST_CLASS_TOOL_SET.has(definition.name))
							.map(({ name, description }) => ({ name, description }));
						const ranked = await options.toolRetriever.retrieve(catalog, query, limit ?? 5);
						const matches = ranked
							.map((name) => byName.get(name))
							.filter((definition): definition is AgentToolDefinition => definition !== undefined);
						for (const definition of matches) registered.add(definition.name);
						const payload = agentPayloadResultSchema.parse(
							matches.map((definition) => ({
								name: definition.name,
								description: definition.description,
								classification: definition.classification,
								input_schema: z.toJSONSchema(definition.parameters, { io: 'input' }),
								callable_directly: true
							}))
						);
						if (payload.kind === 'corrupt') throw new Error(payload.message);
						return payload.value;
					})
				};
			const definition = byName.get(name);
			if (!definition)
				throw new ToolLifecycleError('Registered MCP tool is absent from its permitted catalog');
			return { kind: 'ready', action: definition.prepare(input) };
		}, extra.signal);
		if (prepared.kind === 'failure') return result(prepared.failure);
		const output = await executeToolAction(prepared.action, extra.signal);
		if (name === 'search_tools' && readToolFailure(output) === undefined)
			await server.sendToolListChanged();
		return result(output);
	});
	return server;
};
