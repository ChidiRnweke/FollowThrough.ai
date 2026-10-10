import type {
	AgentRunRepository,
	AgentRunEventRepository,
	AgentRunDecisionRepository,
	AgentSessionRepository
} from '$lib/server/repositories/agent';
import { AgentRunStatusService, type AgentRunStatusRules } from '$lib/services/agent/run-status';
import {
	AgentStreamPresentationService,
	type AgentStreamPresentation
} from '$lib/server/services/agent/runs/stream-presentation';
import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import { AgentSdkInfrastructure } from '$lib/server/adapters/agent/execution-infrastructure';
import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import { AgentPromptService } from '$lib/server/services/agent/runs/instructions';
import type { AgentRunner } from '$lib/server/services/agent/runs/contracts';
import {
	ConversationHistoryService,
	type ConversationHistory
} from '$lib/server/services/agent/conversations/history';
import {
	AgentImagePreparationService,
	type AgentImagePreparation
} from '$lib/server/services/agent/runs/images';
import {
	AgentPreferenceEditingService,
	type AgentPreferenceEditing
} from '$lib/services/agent/preferences';
import {
	AgentModelSelectionService,
	AgentModelChoiceService,
	type IAgentModelSelectionService,
	type IAgentModelChoiceService
} from '$lib/services/agent/model-selection';
import {
	createMcpToolSurface,
	type McpSurfaceFactory
} from '$lib/server/factories/agent/mcp-tool-factory';
import type { IAgentContext } from '$lib/server/services/agent/runs/context';
import { createAgentContext } from '$lib/server/factories/agent-context';
import { CachedAgentModels } from '$lib/server/controllers/agent/model-catalog';
import { ModelCatalogStore } from '$lib/server/stores/agent/model-catalog';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import type { TokenCounter } from '$lib/models/tokenization';
import {
	RunCheckpoints,
	type RunCheckpointWriter
} from '$lib/server/services/agent/runs/checkpoints';
import {
	RunPreparation,
	type ChatRunPreparation
} from '$lib/server/services/agent/runs/preparation';
import { RunApprovals, type RunApprovalDecisions } from '$lib/server/services/agent/runs/approvals';
import {
	RunCancellation,
	type RunCancellationDecisions
} from '$lib/server/services/agent/runs/cancellation';
import type { DateTime } from '$lib/models/workspace';
import { RunSettlements, type RunSettlement } from '$lib/server/services/agent/runs/settlement';
import {
	NoteActionRequests,
	type NoteActionSubmission
} from '$lib/server/services/agent/runs/note-action-requests';
import { OpenRouter } from '@openrouter/sdk';
import type { WebResearchOptions } from '$lib/models/agent';
import { normalizeLanguageModelId } from '$lib/models/agent';
import { webSearchOptionsFromEnvironment } from '$lib/server/factories/agent/web-research-configuration';
import { AgentRunSettingsService, type AgentRunSettings } from '$lib/services/agent/run-settings';
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
import {
	ConversationArchive,
	type ConversationSessions,
	type ConversationMessages
} from '$lib/server/services/agent/conversations/archive';
import { createConversationSession } from '$lib/server/factories/agent/conversation-factory';
import { AgentEventStore, type AgentEventBus } from '$lib/server/stores/agent/events';
import { AgentRunLedger, type WorkflowRunLedger } from '$lib/server/services/agent/runs/ledger';
import {
	AgentModels,
	AgentPreferenceCatalog,
	type AgentPreferenceEditor,
	type AgentModelCatalog
} from '$lib/server/services/agent/runs/preferences';
import { AgentExecution } from '$lib/server/controllers/agent/execution';
import {
	ToolTrust,
	type TrustPolicyStore,
	type TrustPolicyEvaluator
} from '$lib/server/services/agent/runs/tool-trust';
import {
	ToolAccess,
	type ToolPreferenceCapability
} from '$lib/server/services/agent/tools/preferences';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import { traceAgentTurn } from '$lib/server/services/telemetry';
import { AgentToolCatalogService, type AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import { agentToolRegistry } from '$lib/server/factories/agent/agent-tool-factory';
import type { ProductionControllerFactory } from '$lib/server/factories/production-controller-factory';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import { createReplayVirtualizer } from '$lib/server/factories/agent/conversation-factory';

export interface AgentCapabilityInput {
	readonly tokens: TokenCounter;
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
	readonly runStatus: AgentRunStatusRules;
	readonly streamPresentation: Pick<AgentStreamPresentation, 'segments'>;
	readonly conversationHistory: Pick<ConversationHistory, 'rewind'>;
	readonly imagePreparation: AgentImagePreparation;
	readonly preferenceEditing: AgentPreferenceEditing;
	readonly mcpSurface: McpSurfaceFactory;
	readonly now: () => DateTime;
	readonly runSettings: AgentRunSettings;
	readonly webSearchOverrides: WebResearchOptions;
	readonly agentAvailable: boolean;
	readonly conversations: ConversationSessions;
	readonly conversationMessages: ConversationMessages;
	readonly preferences: AgentPreferenceEditor;
	readonly models: AgentModelCatalog;
	readonly modelSelection: IAgentModelSelectionService;
	readonly modelChoices: IAgentModelChoiceService;
	readonly toolPreferences: ToolPreferenceCapability;
	readonly toolCatalog: AgentToolCatalog;
	readonly trust: TrustPolicyStore & TrustPolicyEvaluator;
	readonly runs: AgentRunRepository;
	readonly cancellations: RunCancellationDecisions;
	readonly approvals: RunApprovalDecisions;
	readonly preparation: ChatRunPreparation;
	readonly checkpoints: RunCheckpointWriter;
	readonly runLedger: WorkflowRunLedger;
	readonly runEvents: AgentRunEventRepository;
	readonly runDecisions: AgentRunDecisionRepository;
	readonly sessions: AgentSessionRepository;
	readonly context: IAgentContext;
	readonly runner: AgentRunner;
	readonly settlements: RunSettlement;
	readonly noteActionRequests: NoteActionSubmission;
	readonly eventBus: AgentEventBus;
}

export const createAgentCapability = (input: AgentCapabilityInput): AgentCapability => {
	const conversationRepository = new ConversationRecords(input.db);
	const conversations = new ConversationArchive(conversationRepository);
	const preferences = new AgentPreferenceCatalog(
		new AgentPreferenceRecords(input.db, workspaceResourceKey)
	);
	const models =
		input.modelCatalog ??
		new CachedAgentModels(
			new AgentModels(
				new OpenRouter({
					apiKey: input.openRouterApiKey,
					httpReferer: input.appURL,
					xTitle: 'FollowThrough'
				}).models,
				new Set(input.recommendedModels.map(normalizeLanguageModelId))
			),
			new ModelCatalogStore()
		);
	const tokens = input.tokens;
	const runs = new AgentRunRecords(input.db);
	const runLedger = new AgentRunLedger(runs);
	const runEvents = new AgentRunEventRecords(input.db);
	const settlements = new RunSettlements(runs, runEvents);
	const runDecisions = new AgentRunDecisionRecords(input.db);
	const sessions = new AgentSessionRecords(input.db);
	const eventBus = new AgentEventStore();
	const context = createAgentContext(tokens);
	const runner = new AgentExecution(
		new AgentPromptService(),
		new AgentToolRecoveryService(),
		createAgentStream,
		agentToolRegistry(input.controllers, input.toolRetriever, tokens),
		{
			create: (actor, conversationId) =>
				createConversationSession(
					sessions,
					actor,
					conversationId,
					createReplayVirtualizer(input.files, tokens)
				)
		},
		Boolean(input.openRouterApiKey),
		new AgentSdkInfrastructure(
			input.openRouterApiKey,
			input.openRouterBaseURL,
			input.appURL,
			undefined,
			undefined
		),
		traceAgentTurn
	);

	return {
		mcpSurface: (context) =>
			createMcpToolSurface({
				...context,
				controllers: input.controllers(),
				tokens,
				toolRetriever: input.toolRetriever
			}),
		imagePreparation: new AgentImagePreparationService(),
		runStatus: new AgentRunStatusService(),
		streamPresentation: new AgentStreamPresentationService(),
		runSettings: new AgentRunSettingsService(),
		webSearchOverrides: webSearchOptionsFromEnvironment(process.env),
		agentAvailable: Boolean(input.openRouterApiKey.trim()),
		now: () => new Date().toISOString() as DateTime,
		conversations,
		conversationMessages: conversations,
		conversationHistory: new ConversationHistoryService(sessions),
		preferences,
		models,
		preferenceEditing: new AgentPreferenceEditingService(),
		modelSelection: new AgentModelSelectionService(),
		modelChoices: new AgentModelChoiceService(),
		toolPreferences: new ToolAccess(new ToolPreferenceRecords(input.db)),
		toolCatalog: new AgentToolCatalogService(),
		trust: new ToolTrust(new TrustPolicyRecords(input.db)),
		runs,
		cancellations: new RunCancellation(runs),
		approvals: new RunApprovals(runs),
		preparation: new RunPreparation(runs),
		checkpoints: new RunCheckpoints(runs),
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
