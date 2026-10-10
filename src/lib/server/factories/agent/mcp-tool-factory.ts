import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import type { TokenCounter } from '$lib/models/tokenization';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import { McpTools, type ToolAccessPolicy } from './agent-tool-factory';
import { ToolCallBoundary } from '$lib/server/adapters/agent/tool-call';
import { McpToolProtocol } from '$lib/server/adapters/agent/mcp-tools';
import { AgentToolCalls } from '$lib/server/controllers/agent/tool-calls';
import { McpToolSession } from '$lib/server/controllers/agent/mcp-tools';
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
	readonly controllers: ControllerFactory;
	readonly toolRetriever: ToolRetriever;
}

export const createMcpToolSurface = (options: McpToolSurfaceOptions): Server => {
	const registry = new McpTools(
		options.tokens,
		options.controllers,
		options.actor,
		{ provenanceId: options.provenanceId },
		options.toolAccess
	);
	const permitted = registry.definitions(
		options.scope === 'read' ? { classifications: ['read'] } : {}
	);
	const protocol = new McpToolProtocol(permitted, (value) => readToolFailure(value) !== undefined);
	return protocol.create(
		new McpToolSession(
			permitted,
			createAgentToolDiscovery(
				permitted.map(({ name, description }) => ({ name, description })),
				permitted,
				options.toolRetriever,
				[]
			),
			new AgentToolCalls(new ToolCallBoundary()),
			protocol,
			new AgentToolCatalogService()
		)
	);
};
