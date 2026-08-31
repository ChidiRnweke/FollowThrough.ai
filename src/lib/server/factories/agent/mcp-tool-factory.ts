// chisel-ignore-file structural:factory-contains-logic -- MCP protocol adapter maps the shared capability surface to protocol schemas and error envelopes; it is not application composition.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import { DomainError } from '$lib/errors';
import {
	readAgentPayload,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import type { ToolRetriever } from '$lib/server/services/agent/tools/tool-retriever';
import {
	McpTools,
	FIRST_CLASS_TOOL_NAMES,
	type AgentToolDefinition,
	type ToolAccessPolicy
} from './agent-tool-factory';

export interface McpToolSurfaceOptions {
	readonly controllers: ControllerFactory;
	readonly actor: ActorContext;
	readonly scope: ApiTokenScope;
	readonly provenanceId: ProvenanceId;
	readonly toolRetriever: ToolRetriever;
	/** The user's resolved tool authority for this MCP request. */
	readonly toolAccess: ToolAccessPolicy;
}

/**
 * MCP carries results as content blocks; every tool here returns JSON text.
 *
 * The parameter is {@link AgentPayload} rather than `unknown`, so the runtime
 * `undefined` check this used to carry is gone with it: a definition's `execute`
 * has already read its result into that type and raises on anything that cannot
 * be represented as JSON, which is the check the guard was standing in for.
 */
const ok = (result: AgentPayload) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(result) }]
});

interface McpToolFailure {
	readonly kind: 'error';
	readonly code: string;
	readonly message: string;
}

const failed = (failure: McpToolFailure) => ({
	isError: true,
	content: [{ type: 'text' as const, text: JSON.stringify(failure) }]
});

/**
 * Runs a tool body, turning domain failures into MCP tool errors. A thrown
 * error would fail the whole JSON-RPC call; `isError` lets the host's model
 * see what went wrong and try something else.
 */
const attempt = async (run: () => Promise<AgentPayload>) => {
	try {
		return ok(await run());
		// audit-allow: silent-catch — the MCP adapter converts every thrown domain failure into its explicit failed tool result.
	} catch (error) {
		if (error instanceof DomainError)
			return failed({ kind: 'error', code: error.code, message: error.message });
		return failed({
			kind: 'error',
			code: 'INTERNAL_ERROR',
			message: error instanceof Error ? error.message : String(error)
		});
	}
};

/**
 * Read-classified tools are safe to retry and never write; mutations change
 * state irreversibly. Hosts use these hints to decide what to auto-approve.
 */
const annotationsFor = (definition: AgentToolDefinition) => ({
	readOnlyHint: definition.classification === 'read',
	destructiveHint: definition.classification === 'mutation'
});

/**
 * Exposes the agent's capabilities to an external MCP host, mirroring the
 * in-app surface built by `AgentTools.agentTools()`: a handful of
 * first-class tools, plus `search_tools` for the long tail. Search promotes a
 * result into a real top-level MCP tool and emits tools/list_changed. That
 * keeps the advertised tool list small enough to sit in a host's context
 * alongside its own tools.
 *
 * The scope filter and the user's tool selection are applied to a single
 * `permitted` list that both direct registration and search promotion use, so
 * neither a `read` token nor a deselected tool can be reached by name.
 */
export const createMcpToolSurface = (options: McpToolSurfaceOptions): McpServer => {
	const registry = new McpTools(
		options.controllers,
		options.actor,
		{
			provenanceId: options.provenanceId
		},
		options.toolAccess
	);

	const permitted = registry.definitions(
		options.scope === 'read' ? { classifications: ['read'] } : {}
	);
	// Keyed by `string` for the same reason as in `AgentTools.agentTools`: the
	// retriever answers with names from the embedding store, and the lookup is
	// what turns one of those into a definition.
	const byName = new Map<string, AgentToolDefinition>(
		permitted.map((definition) => [definition.name, definition])
	);
	const server = new McpServer(
		{ name: 'followthrough', version: '1.0.0' },
		{
			instructions:
				'FollowThrough is a connected workspace of notes, projects, todos and references. ' +
				'Ground yourself with `search` or `get_workspace_context` before acting. ' +
				'Tools beyond the ones listed here are available: find them with `search_tools`. Each result is then registered as a real top-level tool; call that exact name with the flat arguments in its `input_schema`. There is no wrapper tool.'
		}
	);

	const registered = new Set<string>();
	const register = (definition: AgentToolDefinition): void => {
		if (registered.has(definition.name)) return;
		server.registerTool(
			definition.name,
			{
				description: definition.description,
				inputSchema: definition.parameters.shape,
				annotations: annotationsFor(definition)
			},
			(input: AgentPayloadObject) => attempt(() => definition.execute(input))
		);
		registered.add(definition.name);
	};

	for (const name of FIRST_CLASS_TOOL_NAMES) {
		const definition = byName.get(name);
		if (!definition) continue;
		register(definition);
	}

	// First-class tools are already registered above and carry no stored embedding,
	// so they cannot be ranked here. App-only definitions never enter McpTools.
	const discoverable = permitted.filter(
		(definition) => !FIRST_CLASS_TOOL_NAMES.includes(definition.name)
	);

	server.registerTool(
		'search_tools',
		{
			description:
				'Find more FollowThrough tools relevant to what you want to do. Every returned match is registered as a real top-level tool; call its exact name with flat arguments matching input_schema.',
			inputSchema: {
				query: z.string().min(1),
				limit: z.number().int().min(1).max(15).optional()
			},
			annotations: { readOnlyHint: true, destructiveHint: false }
		},
		async (input) => {
			const catalog = discoverable.map((definition) => ({
				name: definition.name,
				description: definition.description
			}));
			const ranked = await options.toolRetriever.retrieve(catalog, input.query, input.limit ?? 5);
			const matches = ranked
				.map((name) => byName.get(name))
				.filter((definition): definition is AgentToolDefinition => definition !== undefined);
			for (const definition of matches) register(definition);
			// Read rather than asserted: `z.toJSONSchema` answers with zod's own
			// payload type, which is the one value on this surface that is not
			// already known to be JSON.
			const results = readAgentPayload(
				matches.map((definition) => ({
					name: definition.name,
					description: definition.description,
					classification: definition.classification,
					input_schema: z.toJSONSchema(definition.parameters, { io: 'input' }),
					callable_directly: true
				}))
			);
			if (results.kind === 'corrupt')
				return failed({
					kind: 'error',
					code: 'INTERNAL_ERROR',
					message: `A tool schema could not be represented as JSON: ${results.message}`
				});
			return ok(results.value);
		}
	);

	return server;
};
