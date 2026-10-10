import type { AgentExecutionMode } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { TokenCounter } from '$lib/models/tokenization';
import type { AgentToolSurface, McpToolSurface } from '$lib/server/adapters/agent/tool-registry';
import { AgentToolDefinitions } from '$lib/server/controllers/agent/tool-definitions';
import type { AgentToolControllerProvider } from '$lib/server/controllers/agent/tool-provider';
import { AgentToolResults } from '$lib/server/controllers/agent/tool-results';
import type { AgentToolReviewControl } from '$lib/server/controllers/agent/tool-reviews';
import {
	AgentToolSessions,
	type AgentToolRegistry,
	type AgentToolSessionInput
} from '$lib/server/controllers/agent/tool-sessions';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';
import { AgentToolResultSelection } from '$lib/server/services/agent/tool-result-selection';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { createSdkTool } from './sdk-tool-factory';
import { createAgentToolDiscovery } from './tool-discovery-factory';
import { createToolReviews } from './tool-review-factory';
export type { AgentToolDefinition } from '$lib/server/adapters/agent/tool-definitions';
export type { AgentToolSurface } from '$lib/server/adapters/agent/tool-registry';
export type {
	AgentToolContext,
	McpToolContext,
	ToolAccessPolicy
} from '$lib/server/controllers/agent/tool-context';
export type { AgentToolOutput } from '$lib/server/controllers/agent/tool-outputs';
export { agentToolCoverage } from './tool-coverage';
export type { AgentToolCoverage } from './tool-coverage';

import {
	appToolDefinitions,
	mcpOnlyDefinitions,
	selectionToolDefinitions,
	sharedToolDefinitions
} from '$lib/server/adapters/agent/tool-definitions';
import {
	AgentToolRegistryAdapter,
	McpToolRegistryAdapter
} from '$lib/server/adapters/agent/tool-registry';
import { AgentToolAuthorities } from '$lib/server/controllers/agent/tool-authority';
import type {
	AgentToolContext,
	McpToolContext,
	ToolAccessPolicy
} from '$lib/server/controllers/agent/tool-context';
import {
	createAppToolOperations,
	createMcpToolOperations,
	createSelectionToolOperations,
	createSharedToolOperations
} from './tool-operations-factory';
const toolResults = new AgentToolResults(
	new AgentToolCatalogService(),
	new AgentToolResultSelection()
);
export const createAgentToolSurface = (
	_tokens: TokenCounter,
	controllers: AgentToolControllerProvider,
	actor: ActorContext,
	mode: AgentExecutionMode,
	context: AgentToolContext,
	executor: AgentToolExecutor,
	retriever: ToolRetriever,
	access: ToolAccessPolicy,
	reviews: AgentToolReviewControl = createToolReviews(() => controllers.notes(), actor),
	signal: AbortSignal = new AbortController().signal
): AgentToolSurface => {
	const definitions = new AgentToolDefinitions(
		context.input,
		() =>
			Object.values(
				sharedToolDefinitions(
					toolResults,
					createSharedToolOperations(controllers, actor, context.provenanceId)
				)
			),
		() =>
			Object.values(
				appToolDefinitions(toolResults, createAppToolOperations(controllers, actor, context))
			),
		(selection) =>
			Object.values(
				selectionToolDefinitions(
					toolResults,
					createSelectionToolOperations(controllers, actor, selection, context.model)
				)
			)
	);
	return new AgentToolRegistryAdapter(
		mode,
		executor,
		reviews,
		signal,
		new AgentToolAuthorities(new AgentToolCatalogService(), access),
		() => definitions.definitions(),
		(catalog, definitions, promoted) =>
			createAgentToolDiscovery(catalog, definitions, retriever, promoted),
		createSdkTool
	);
};
export const createMcpToolDefinitions = (
	_tokens: TokenCounter,
	controllers: AgentToolControllerProvider,
	actor: ActorContext,
	context: McpToolContext,
	access: ToolAccessPolicy
): McpToolSurface => {
	return new McpToolRegistryAdapter(
		new AgentToolAuthorities(new AgentToolCatalogService(), access),
		() => [
			...Object.values(
				sharedToolDefinitions(
					toolResults,
					createSharedToolOperations(controllers, actor, context.provenanceId)
				)
			),
			...Object.values(
				mcpOnlyDefinitions(toolResults, createMcpToolOperations(controllers, actor, context))
			)
		]
	);
};
export const agentToolRegistry = (
	controllers: () => AgentToolControllerProvider,
	toolRetriever: ToolRetriever,
	tokens: TokenCounter
): ((input: AgentToolSessionInput) => Promise<AgentToolRegistry>) => {
	const sessions = new AgentToolSessions(() => {
		const factory = controllers();
		return {
			preferences: factory.toolPreferences(),
			create: ({ actor, request, run, executor, signal }, authority) => {
				const reviews = createToolReviews(() => factory.notes(), actor);
				return {
					reviews,
					registry: createAgentToolSurface(
						tokens,
						factory,
						actor,
						run.executionMode,
						{ provenanceId: run.provenanceId as ProvenanceId, input: request, model: run.model },
						executor,
						toolRetriever,
						authority,
						reviews,
						signal
					)
				};
			}
		};
	});
	return (input) => sessions.open(input);
};
