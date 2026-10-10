import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { TokenCounter } from '$lib/models/tokenization';
import { McpToolProtocol } from '$lib/server/adapters/agent/mcp-tools';
import { ToolCallBoundary } from '$lib/server/adapters/agent/tool-call';
import { McpToolSession } from '$lib/server/controllers/agent/mcp-tools';
import { AgentToolCalls } from '$lib/server/controllers/agent/tool-calls';
import type { AgentToolControllerProvider } from '$lib/server/controllers/agent/tool-provider';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpToolDefinitions, type ToolAccessPolicy } from './agent-tool-factory';
import { createAgentToolDiscovery } from './tool-discovery-factory';

export interface McpRequestContext {
	readonly actor: ActorContext;
	readonly scope: ApiTokenScope;
	readonly provenanceId: ProvenanceId;
	readonly toolAccess: ToolAccessPolicy;
}

export type McpSurfaceFactory = (context: McpRequestContext) => Server;

export interface McpToolSurfaceOptions extends McpRequestContext {
	readonly tokens: TokenCounter;
	readonly controllers: AgentToolControllerProvider;
	readonly toolRetriever: ToolRetriever;
}

export const createMcpToolSurface = (options: McpToolSurfaceOptions): Server => {
	const registry = createMcpToolDefinitions(
		options.tokens,
		options.controllers,
		options.actor,
		{ provenanceId: options.provenanceId },
		options.toolAccess
	);
	const permitted = registry.forScope(options.scope);
	const protocol = new McpToolProtocol(permitted, (value) => readToolFailure(value) !== undefined);
	return protocol.create(
		new McpToolSession(
			permitted,
			createAgentToolDiscovery(permitted, permitted, options.toolRetriever, []),
			new AgentToolCalls(new ToolCallBoundary()),
			protocol,
			new AgentToolCatalogService()
		)
	);
};
