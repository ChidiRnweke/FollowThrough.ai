import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import {
	McpToolStartup,
	type McpToolStartupControl
} from '$lib/server/controllers/agent/mcp-startup';
import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { TokenCounter } from '$lib/models/tokenization';
import { McpToolProtocol } from '$lib/server/adapters/agent/mcp-tools';
import { ToolCallBoundary } from '$lib/server/adapters/agent/tool-call';
import { McpToolSession } from '$lib/server/controllers/agent/mcp-tools';
import { AgentToolCalls } from '$lib/server/controllers/agent/tool-calls';
import type { AgentToolControllerProvider } from '$lib/server/factories/agent/tool-controller-provider';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
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

export type McpSurfaceFactory = (context: McpRequestContext) => McpToolStartupControl<Server>;

export interface McpToolSurfaceOptions extends McpRequestContext {
	readonly tokens: TokenCounter;
	readonly controllers: AgentToolControllerProvider;
	readonly toolRetriever: ToolRetriever;
}

export const createMcpToolSurface = (
	options: McpToolSurfaceOptions
): McpToolStartupControl<Server> => {
	const registry = createMcpToolDefinitions(
		options.tokens,
		options.controllers,
		options.actor,
		{ provenanceId: options.provenanceId },
		options.toolAccess
	);
	return new McpToolStartup(options.scope, registry, (permitted) => {
		const protocol = new McpToolProtocol(permitted, readToolFailure);
		return {
			protocol,
			session: new McpToolSession(
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
		};
	});
};
