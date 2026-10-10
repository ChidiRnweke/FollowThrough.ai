import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { TokenCounter } from '$lib/models/tokenization';
import { McpToolProtocol, type McpToolConnection } from '$lib/server/adapters/agent/mcp-tools';
import { ToolCallBoundary } from '$lib/server/adapters/agent/tool-call';
import { AgentToolCalls } from '$lib/server/adapters/agent/tool-invocation-errors';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import { createMcpToolDefinitions, type ToolAccessPolicy } from './agent-tool-factory';
import type { AgentToolDiscoveryServices } from './tool-discovery-factory';
export interface McpRequestContext {
	readonly actor: ActorContext;
	readonly scope: ApiTokenScope;
	readonly provenanceId: ProvenanceId;
	readonly toolAccess: ToolAccessPolicy;
}
export type McpSurfaceFactory = (context: McpRequestContext) => McpToolConnection;
export interface McpToolSurfaceOptions extends McpRequestContext {
	readonly tokens: TokenCounter;
	readonly controllers: ControllerFactory;
	readonly toolRetriever: AgentToolDiscoveryServices;
}
export const createMcpToolSurface = (options: McpToolSurfaceOptions): McpToolConnection =>
	new McpToolProtocol(
		createMcpToolDefinitions(
			options.tokens,
			options.controllers,
			options.actor,
			{ provenanceId: options.provenanceId },
			options.toolAccess,
			options.toolRetriever
		),
		options.scope,
		readToolFailure,
		new AgentToolCalls(new ToolCallBoundary())
	);
