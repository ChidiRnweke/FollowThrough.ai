import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ControllerFactory } from '$lib/factories';
import { DomainError, type ActorContext, type ApiTokenScope, type ProvenanceId } from '$lib/models';
import type { ToolRetriever } from '$lib/services';
import {
	AgentToolRegistry,
	FIRST_CLASS_TOOL_NAMES,
	type AgentToolDefinition,
	type ToolAccessPolicy
} from '../domain/agent-tool-registry';
import {
	invalidUseToolPayload,
	unknownUseToolName,
	type RecoverableUseToolFailure
} from '../domain/tool-recovery';

export interface McpToolSurfaceOptions {
	readonly controllers: ControllerFactory;
	readonly actor: ActorContext;
	readonly scope: ApiTokenScope;
	readonly provenanceId: ProvenanceId;
	readonly toolRetriever: ToolRetriever;
	/** The user's tool selection; omitted, every tool the scope allows is offered. */
	readonly toolAccess?: ToolAccessPolicy;
}

/** MCP carries results as content blocks; every tool here returns JSON text. */
const ok = (result: unknown) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(result ?? null) }]
});

const failed = (failure: string | RecoverableUseToolFailure) => ({
	isError: true,
	content: [
		{
			type: 'text' as const,
			text: JSON.stringify(typeof failure === 'string' ? { failure } : failure)
		}
	]
});

/**
 * Runs a tool body, turning domain failures into MCP tool errors. A thrown
 * error would fail the whole JSON-RPC call; `isError` lets the host's model
 * see what went wrong and try something else.
 */
const attempt = async (run: () => Promise<unknown>) => {
	try {
		return ok(await run());
	} catch (error) {
		if (error instanceof DomainError) return failed(`${error.code}: ${error.message}`);
		return failed(error instanceof Error ? error.message : String(error));
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
 * in-app surface built by `AgentToolRegistry.agentTools()`: a handful of
 * first-class tools, plus `search_tools`/`use_tool` for the long tail. That
 * keeps the advertised tool list small enough to sit in a host's context
 * alongside its own tools.
 *
 * The scope filter and the user's tool selection are applied to a single
 * `permitted` list that both the direct registrations and `use_tool` dispatch
 * from, so neither a `read` token nor a deselected tool can be reached by name.
 */
export const createMcpToolSurface = (options: McpToolSurfaceOptions): McpServer => {
	const registry = new AgentToolRegistry(
		options.controllers,
		options.actor,
		// MCP has no approval-interrupt channel; the host owns approval UX, so
		// the registry must never mark a tool as needing in-app approval.
		'auto_accept',
		{
			provenanceId: options.provenanceId,
			// Tool handlers read only `noteId`/`conversationId` off this, and an
			// MCP caller is not editing a note or in a conversation.
			input: { prompt: '' },
			model: 'mcp'
		},
		// No AgentToolExecutor: its only job is emitting `resources_stale` for
		// the in-app SSE stream, which has no meaning for an external client.
		undefined,
		undefined,
		options.toolAccess
	);

	const permitted = registry.definitions(
		options.scope === 'read' ? { classifications: ['read'] } : {}
	);
	const byName = new Map(permitted.map((definition) => [definition.name, definition]));
	const names = permitted.map((definition) => definition.name);

	const server = new McpServer(
		{ name: 'followthrough', version: '1.0.0' },
		{
			instructions:
				'FollowThrough is a connected workspace of notes, projects, todos and references. ' +
				'Ground yourself with `search` or `get_workspace_context` before acting. ' +
				'Tools beyond the ones listed here are available: find them with `search_tools`, inspect the returned `input_schema`, then call `use_tool` as {"name":"exact_name","payload":{...}} without nesting or stringifying it.'
		}
	);

	for (const name of FIRST_CLASS_TOOL_NAMES) {
		const definition = byName.get(name);
		if (!definition) continue;
		server.registerTool(
			definition.name,
			{
				description: definition.description,
				inputSchema: definition.parameters.shape,
				annotations: annotationsFor(definition)
			},
			(input: Record<string, unknown>) => attempt(() => definition.execute(input))
		);
	}

	const discoverable = permitted.filter(
		(definition) => !FIRST_CLASS_TOOL_NAMES.includes(definition.name)
	);

	server.registerTool(
		'search_tools',
		{
			description:
				'Find more FollowThrough tools relevant to what you want to do, when the tool you need is not already available directly. Returns each match with the exact input schema; call it via use_tool.',
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
			return ok(
				ranked
					.map((name) => byName.get(name))
					.filter((definition): definition is AgentToolDefinition => definition !== undefined)
					.map((definition) => ({
						name: definition.name,
						description: definition.description,
						classification: definition.classification,
						input_schema: z.toJSONSchema(definition.parameters)
					}))
			);
		}
	);

	server.registerTool(
		'use_tool',
		{
			description:
				'Execute a FollowThrough tool using the exact name and input_schema returned by search_tools. Pass {"name":"exact_name","payload":{...}} directly; never nest or stringify that object under arguments.',
			inputSchema: {
				name: z.string().min(1),
				payload: z.record(z.string(), z.unknown()).optional()
			},
			// The target decides what actually happens, so claim neither.
			annotations: { readOnlyHint: false, destructiveHint: options.scope !== 'read' }
		},
		async (input) => {
			const target = byName.get(input.name);
			if (!target) return failed(unknownUseToolName(input.name, names));
			const validation = target.parameters.safeParse(input.payload ?? {});
			if (!validation.success)
				return failed(
					invalidUseToolPayload(target.name, validation.error, z.toJSONSchema(target.parameters))
				);
			return attempt(() => target.execute(validation.data as Record<string, unknown>));
		}
	);

	return server;
};
