import { AgentPayloadInspectionService } from '$lib/services/agent/payload';
import {
	AgentReadTool,
	type AgentReadToolController
} from '$lib/server/controllers/agent/read-tool';
import { ToolResultBoundary } from '$lib/server/adapters/agent/read-tool';
import { AgentSdkToolAdapter } from '$lib/server/adapters/agent/sdk-tool';
import { AgentToolExecution } from '$lib/server/controllers/agent/tool-execution';
import type { AgentExecutionMode } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { TokenCounter } from '$lib/models/tokenization';
import type { AgentToolSurface, McpToolSurface } from '$lib/server/adapters/agent/tool-registry';
import {
	AgentToolDefinitions,
	McpToolDefinitions as McpDefinitionSource
} from '$lib/server/controllers/agent/tool-definitions';
import type { AgentToolControllerProvider } from '$lib/server/factories/agent/tool-controller-provider';
import type { AgentToolReviewControl } from '$lib/server/controllers/agent/tool-reviews';
import {
	AgentToolSessions,
	type AgentToolRegistry,
	type AgentToolSessionInput
} from '$lib/server/controllers/agent/tool-sessions';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { createSdkToolInvocation } from './sdk-tool-factory';
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
	AppToolDefinitions,
	McpToolDefinitions,
	SelectionToolDefinitions,
	SharedToolDefinitions
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
const createReadTool = <Input, Result>(
	execute: (input: Input) => Promise<Result>
): AgentReadToolController<Input> =>
	new AgentReadTool(execute, new ToolResultBoundary<Result>(), new AgentPayloadInspectionService());
export const createAgentToolSurface = (
	tokens: TokenCounter,
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
		new SharedToolDefinitions(createReadTool, () =>
			createSharedToolOperations(controllers, actor, context.provenanceId, tokens)
		),
		new AppToolDefinitions(createReadTool, () =>
			createAppToolOperations(controllers, actor, context)
		),
		(selection) =>
			new SelectionToolDefinitions(
				createReadTool,
				createSelectionToolOperations(controllers, actor, selection, context.model)
			)
	);
	return new AgentToolRegistryAdapter(
		new AgentToolExecution(mode, reviews, executor),
		signal,
		new AgentToolAuthorities(new AgentToolCatalogService(), access),
		definitions,
		(catalog, definitions, promoted) =>
			createAgentToolDiscovery(catalog, definitions, retriever, promoted),
		new AgentSdkToolAdapter(),
		createSdkToolInvocation
	);
};
export const createMcpToolDefinitions = (
	tokens: TokenCounter,
	controllers: AgentToolControllerProvider,
	actor: ActorContext,
	context: McpToolContext,
	access: ToolAccessPolicy
): McpToolSurface => {
	return new McpToolRegistryAdapter(
		new AgentToolAuthorities(new AgentToolCatalogService(), access),
		new McpDefinitionSource(
			new SharedToolDefinitions(createReadTool, () =>
				createSharedToolOperations(controllers, actor, context.provenanceId, tokens)
			),
			new McpToolDefinitions(createReadTool, () =>
				createMcpToolOperations(controllers, actor, context)
			)
		)
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
	return sessions.open.bind(sessions);
};
