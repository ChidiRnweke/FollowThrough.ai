import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolLifecycleError } from '$lib/errors';
import { agentPayloadResultSchema, type AgentPayload } from '$lib/models/agent/payload';
import type { ToolClassification } from '$lib/models/agent';
import type {
	McpToolResultReader,
	McpToolSessionControl
} from '$lib/server/controllers/agent/mcp-tools';
import type { PreparedAction } from '$lib/server/controllers/agent/tool-calls';
import { jsonObjectSchema, bindToolArguments } from './tool-call';

export interface McpToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly parameters: z.ZodObject;
	readonly prepare: (input: unknown) => PreparedAction;
}

export class McpToolProtocol implements McpToolResultReader {
	constructor(
		private readonly definitions: readonly McpToolDefinition[],
		private readonly failure: (value: AgentPayload) => boolean
	) {}

	failed(value: AgentPayload): boolean {
		return this.failure(value);
	}

	describe(names: readonly string[]): AgentPayload {
		const payload = agentPayloadResultSchema.parse(
			names.map((name) => {
				const definition = this.definition(name);
				return {
					name: definition.name,
					description: definition.description,
					classification: definition.classification,
					input_schema: z.toJSONSchema(definition.parameters, { io: 'input' }),
					callable_directly: true
				};
			})
		);
		if (payload.kind === 'corrupt') throw new Error(payload.message);
		return payload.value;
	}

	create(session: McpToolSessionControl): Server {
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
				...session.list().map((name) => {
					const definition = this.definition(name);
					return {
						name: definition.name,
						description: definition.description,
						inputSchema: jsonObjectSchema(definition.parameters),
						annotations: {
							readOnlyHint: definition.classification === 'read',
							destructiveHint: definition.classification === 'mutation'
						}
					};
				}),
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
			const response = await session.invoke(
				name,
				() =>
					name === 'search_tools'
						? bindToolArguments(searchParameters, input, ({ query, limit }) =>
								session.search(query, limit ?? 5)
							)
						: this.definition(name).prepare(input),
				extra.signal
			);
			if (response.listChanged) await server.sendToolListChanged();
			return {
				...(this.failed(response.value) ? { isError: true } : {}),
				content: [{ type: 'text' as const, text: JSON.stringify(response.value) }]
			};
		});
		return server;
	}

	private definition(name: string): McpToolDefinition {
		const definition = this.definitions.find((definition) => definition.name === name);
		if (!definition)
			throw new ToolLifecycleError('Registered MCP tool is absent from its permitted catalog');
		return definition;
	}
}
