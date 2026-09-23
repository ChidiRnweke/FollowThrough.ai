import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import type { DateTime } from '$lib/models/workspace';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { OpenRouter } from '@openrouter/sdk';
import { normalizeLanguageModelId, webSearchOptionsFromEnvironment } from '$lib/models/agent';
import type { Database } from '$lib/server/db';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import {
	AgentPreferenceRecords,
	AgentRunRecords,
	AgentSessionRecords
} from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { ToolPreferenceRecords } from '$lib/server/repositories/agent/postgres/tool-preferences';
import { TrustPolicyRecords } from '$lib/server/repositories/agent/postgres/trust-policies';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { ConversationBuffer } from '$lib/server/services/agent/conversations/buffer';
import { AgentContext } from '$lib/server/services/agent/runs/context';
import { AgentEvents } from '$lib/server/services/agent/runs/events';
import { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import {
	AgentModels,
	AgentPreferenceCatalog,
	type AgentModelCatalog
} from '$lib/server/services/agent/runs/preferences';
import { AgentReasoning } from '$lib/server/services/agent/runs/reasoning';
import { ToolTrust } from '$lib/server/services/agent/runs/tool-trust';
import { ToolAccess } from '$lib/server/services/agent/tools/preferences';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import { traceAgentTurn } from '$lib/server/services/telemetry';
import { agentToolCatalog } from '$lib/server/factories/agent/agent-tool-catalog-factory';
import { agentToolRegistry } from '$lib/server/factories/agent/agent-tool-factory';
import type { ProductionControllerFactory } from '$lib/server/factories/production-controller-factory';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import { AgentReplayVirtualizer } from '$lib/server/services/agent/conversations/replay-virtualizer';

export interface AgentCapabilityInput {
	readonly db: Database;
	readonly controllers: () => ProductionControllerFactory;
	readonly toolRetriever: ToolRetriever;
	readonly files: AgentFileRepository;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly defaultModel: string;
	readonly defaultVisionModel: string;
	readonly recommendedModels: readonly string[];
	readonly modelCatalog?: AgentModelCatalog;
}

export interface AgentCapability {
	readonly now: () => DateTime;
	readonly conversations: ConversationArchive;
	readonly preferences: AgentPreferenceCatalog;
	readonly models: AgentModelCatalog;
	readonly toolPreferences: ToolAccess;
	readonly trust: ToolTrust;
	readonly runs: AgentRunRecords;
	readonly cancellations: RunCancellation;
	readonly runLedger: AgentRunLedger;
	readonly runEvents: AgentRunEventRecords;
	readonly runDecisions: AgentRunDecisionRecords;
	readonly sessions: AgentSessionRecords;
	readonly context: AgentContext;
	readonly runner: AgentReasoning;
	readonly settlements: RunSettlements;
	readonly noteActionRequests: NoteActionRequests;
	readonly eventBus: AgentEvents;
}

export const createAgentCapability = (input: AgentCapabilityInput): AgentCapability => {
	const conversationRepository = new ConversationRecords(input.db);
	const conversations = new ConversationArchive(conversationRepository);
	const preferences = new AgentPreferenceCatalog(new AgentPreferenceRecords(input.db));
	const models =
		input.modelCatalog ??
		new AgentModels(
			new OpenRouter({
				apiKey: input.openRouterApiKey,
				httpReferer: input.appURL,
				xTitle: 'FollowThrough'
			}),
			new Set(input.recommendedModels.map(normalizeLanguageModelId))
		);
	const runs = new AgentRunRecords(input.db);
	const runLedger = new AgentRunLedger(runs);
	const runEvents = new AgentRunEventRecords(input.db);
	const settlements = new RunSettlements(runs, runEvents);
	const runDecisions = new AgentRunDecisionRecords(input.db);
	const sessions = new AgentSessionRecords(input.db);
	const eventBus = new AgentEvents();
	const context = new AgentContext();
	const runner = new AgentReasoning(
		agentToolRegistry(input.controllers, input.toolRetriever),
		sessions,
		input.openRouterApiKey,
		input.openRouterBaseURL,
		input.appURL,
		undefined,
		(repository, actor, conversationId) =>
			new ConversationBuffer(
				repository,
				actor,
				conversationId,
				new AgentReplayVirtualizer(input.files)
			),
		traceAgentTurn,
		webSearchOptionsFromEnvironment(process.env)
	);

	return {
		now: () => new Date().toISOString() as DateTime,
		conversations,
		preferences,
		models,
		toolPreferences: new ToolAccess(new ToolPreferenceRecords(input.db), agentToolCatalog),
		trust: new ToolTrust(new TrustPolicyRecords(input.db)),
		runs,
		cancellations: new RunCancellation(runs),
		runLedger,
		runEvents,
		runDecisions,
		sessions,
		context,
		runner,
		settlements,
		noteActionRequests: new NoteActionRequests(runs, runEvents, conversationRepository),
		eventBus
	};
};
