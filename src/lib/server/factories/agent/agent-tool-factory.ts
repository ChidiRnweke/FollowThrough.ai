import type { AgentToolContext, McpToolContext } from '$lib/models/agent-tool-context';
import type { AgentTool, AgentToolPolicy, AgentToolset } from '$lib/models/agent-tool-protocol';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { createAgentTools, createMcpTools } from './tools/definitions';
import { createAgentToolset } from './tools/toolset';
export { agentToolCoverage } from './tool-coverage';
export type { AgentToolCoverage } from './tool-coverage';
export type { AgentToolContext, McpToolContext } from '$lib/models/agent-tool-context';

/** The tool constructors the agent harness receives. */
export interface AgentToolConstruction {
	readonly tools: (context: AgentToolContext) => readonly AgentTool[];
	readonly mcpTools: (context: McpToolContext) => readonly AgentTool[];
	readonly toolset: (tools: readonly AgentTool[], policy: AgentToolPolicy) => AgentToolset;
}

/** Tools wrap controller operations, so the controllers are resolved when a tool list is built. */
export const createAgentToolConstruction = (
	controllers: () => ControllerFactory
): AgentToolConstruction => ({
	tools: (context) => createAgentTools(controllers(), context),
	mcpTools: (context) => createMcpTools(controllers(), context),
	toolset: createAgentToolset
});
