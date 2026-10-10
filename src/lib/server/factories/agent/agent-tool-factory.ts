import { AgentToolApprovalRules } from '$lib/services/agent/tool-approval';
import type { AgentExecutionMode } from '$lib/models/agent';
import type { AgentToolReviewControl } from '$lib/models/agent-tool-reviews';
import type { AgentToolRegistry, AgentToolSessionInput } from '$lib/models/agent-tool-session';
import type { ActorContext } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { TokenCounter } from '$lib/models/tokenization';
import { AgentSdkToolAdapter } from '$lib/server/adapters/agent/sdk-tool';
import {
	AgentToolDefinitions,
	McpToolDefinitions as McpDefinitionSource
} from '$lib/server/adapters/agent/tool-definition-source';
import type { AgentToolSurface, McpToolSurface } from '$lib/server/adapters/agent/tool-registry';
import { AgentToolSessionAdapter } from '$lib/server/adapters/agent/tool-session';
import { AgentToolSessions } from '$lib/server/controllers/agent/tool-sessions';
import { instrumentedController } from '../controller-instrumentation';
import type { AgentToolDiscoveryServices } from '$lib/server/factories/agent/tool-discovery-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { AgentToolCompletionObserver } from '$lib/server/services/agent/runs/contracts';
import type { ToolPreferenceCapability } from '$lib/server/services/agent/tools/preferences';
import { AgentToolDiscoveryStore } from '$lib/server/stores/agent/tool-discovery';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { agentToolAuthoritySurface, agentToolSessionSurface } from '../controller-surfaces';
import { createSdkToolInvocation } from './sdk-tool-factory';
import { createToolReviews } from './tool-review-factory';
export type {
	AgentToolContext,
	McpToolContext,
	ToolAccessPolicy
} from '$lib/models/agent-tool-context';
export type { AgentToolDefinition } from '$lib/server/adapters/agent/tool-definitions';
export type { AgentToolSurface } from '$lib/server/adapters/agent/tool-registry';
export { agentToolCoverage } from './tool-coverage';
export type { AgentToolCoverage } from './tool-coverage';

import type {
	AgentToolContext,
	McpToolContext,
	ToolAccessPolicy
} from '$lib/models/agent-tool-context';
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
export const createAgentToolSurface = (
	tokens: TokenCounter,
	controllers: ControllerFactory,
	actor: ActorContext,
	mode: AgentExecutionMode,
	context: AgentToolContext,
	executor: AgentToolCompletionObserver,
	retriever: AgentToolDiscoveryServices,
	access: ToolAccessPolicy,
	reviews: AgentToolReviewControl = createToolReviews(() => controllers.notes(), actor),
	signal: AbortSignal = new AbortController().signal
): AgentToolSurface => {
	const definitions = new AgentToolDefinitions(
		context.input,
		new SharedToolDefinitions(controllers, actor, context.provenanceId),
		new AppToolDefinitions(controllers, actor, context),
		(selection) => new SelectionToolDefinitions(controllers, actor, selection, context.model)
	);
	return new AgentToolRegistryAdapter(
		reviews,
		mode,
		executor,
		signal,
		instrumentedController(
			'agentToolAuthority',
			new AgentToolAuthorities(
				new AgentToolCatalogService(),
				access,
				retriever.index,
				retriever.embeddings,
				new AgentToolDiscoveryStore(),
				new AgentToolApprovalRules()
			),
			agentToolAuthoritySurface
		),
		definitions,
		new AgentSdkToolAdapter(),
		createSdkToolInvocation
	);
};
export const createMcpToolDefinitions = (
	tokens: TokenCounter,
	controllers: ControllerFactory,
	actor: ActorContext,
	context: McpToolContext,
	access: ToolAccessPolicy,
	retriever: AgentToolDiscoveryServices
): McpToolSurface => {
	return new McpToolRegistryAdapter(
		instrumentedController(
			'agentToolAuthority',
			new AgentToolAuthorities(
				new AgentToolCatalogService(),
				access,
				retriever.index,
				retriever.embeddings,
				new AgentToolDiscoveryStore(),
				new AgentToolApprovalRules()
			),
			agentToolAuthoritySurface
		),
		new McpDefinitionSource(
			new SharedToolDefinitions(controllers, actor, context.provenanceId),
			new McpToolDefinitions(controllers, actor, context)
		)
	);
};
export const agentToolRegistry = (
	controllers: () => ControllerFactory,
	toolRetriever: AgentToolDiscoveryServices,
	tokens: TokenCounter,
	preferences: ToolPreferenceCapability
): ((input: AgentToolSessionInput) => Promise<AgentToolRegistry>) => {
	const sessions = new AgentToolSessionAdapter(
		instrumentedController(
			'agentToolSession',
			new AgentToolSessions(preferences, new AgentToolCatalogService()),
			agentToolSessionSurface
		),
		({ actor, request, run, executor, signal }, authority) => {
			const factory = controllers();
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
	);
	return sessions.open.bind(sessions);
};
