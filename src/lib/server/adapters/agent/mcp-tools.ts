import { ToolLifecycleError } from '$lib/errors';
import type { ToolClassification } from '$lib/models/agent';
import type { ToolDiscoveryPlan } from '$lib/models/agent-tool-authority';
import type { AgentToolCallControl, PreparedAction } from '$lib/models/agent-tool-protocol';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ApiTokenScope } from '$lib/models/identity';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { bindToolArguments, jsonObjectSchema } from './tool-call';
import type { AgentToolDefinition } from './tool-definitions';
import type { McpToolSurface } from './tool-registry';

export interface McpToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly parameters: z.ZodObject;
	readonly prepare: (input: unknown) => PreparedAction;
}

export interface McpToolConnection {
	open(): Server;
}
export class McpToolProtocol implements McpToolConnection {
	constructor(
		private readonly registry: McpToolSurface,
		private readonly scope: ApiTokenScope,
		private readonly readFailure: (value: AgentPayload) => string | undefined,
		private readonly calls: AgentToolCallControl
	) {}

	failed(value: AgentPayload): boolean {
		return this.readFailure(value) !== undefined;
	}

	open(): Server {
		const { definitions, plan } = this.registry.open(this.scope);
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
				...this.registry.offered(plan).map((name) => {
					const definition = this.definition(definitions, name);
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
			const response = await this.invoke(
				plan,
				name,
				() =>
					name === 'search_tools'
						? bindToolArguments(searchParameters, input, ({ query, limit }) =>
								this.registry.search(plan, definitions, query, limit ?? 5)
							)
						: this.definition(definitions, name).prepare(input),
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

	private definition(definitions: readonly AgentToolDefinition[], name: string): McpToolDefinition {
		const definition = definitions.find((definition) => definition.name === name);
		if (!definition)
			throw new ToolLifecycleError('Registered MCP tool is absent from its permitted catalog');
		return definition;
	}

	private async invoke(
		plan: ToolDiscoveryPlan,
		name: string,
		prepare: () => PreparedAction,
		signal: AbortSignal
	): Promise<{ readonly value: AgentPayload; readonly listChanged: boolean }> {
		const refusal = this.registry.authorize(plan, name);
		if (refusal) return { value: refusal, listChanged: false };
		const prepared = await this.calls.prepare(
			async () => ({ kind: 'ready', action: prepare() }),
			signal
		);
		if (prepared.kind === 'failure') return { value: prepared.failure, listChanged: false };
		const value = await this.calls.execute(prepared.action, signal);
		return { value, listChanged: name === 'search_tools' && !this.failed(value) };
	}
}
