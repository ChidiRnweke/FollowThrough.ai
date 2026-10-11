import type { ActorContext } from '$lib/models/identity';
import {
	AgentRunDecisionService,
	AgentRunEventService,
	AgentRunService,
	AgentSessionService,
	type AgentRunDecisions,
	type AgentRunEvents,
	type AgentRuns,
	type AgentSessions
} from '$lib/server/services/agent/runs/records';

import type { WebResearchOptions } from '$lib/models/agent';
import { normalizeLanguageModelId } from '$lib/models/agent';
import type { TokenCounter } from '$lib/models/tokenization';
import type { DateTime } from '$lib/models/workspace';
import type { Database } from '$lib/server/db';
import { createAgentContext } from '$lib/server/factories/agent-context';
import {
	createAgentToolConstruction,
	type AgentToolConstruction
} from '$lib/server/factories/agent/agent-tool-factory';
import { createAgentProviders } from '$lib/server/factories/agent/agent-providers';
import { AgentTurnService, type AgentTurns } from '$lib/server/services/agent/runs/turns';
import type { AgentPromptPreparation } from '$lib/server/services/agent/runs/instructions';
import type { AgentToolRecovery } from '$lib/server/services/agent/runs/tool-recovery';
import {
	AgentToolApprovalRules,
	type AgentToolApprovalPolicy
} from '$lib/services/agent/tool-approval';
import type { AgentTurnObserver } from '$lib/server/controllers/agent/controller';
import {
	createMcpToolSurface,
	type McpSurfaceFactory
} from '$lib/server/factories/agent/mcp-tool-factory';
import type { AgentToolDiscoveryServices } from '$lib/server/factories/agent/tool-discovery-factory';
import { webSearchOptionsFromEnvironment } from '$lib/server/factories/agent/web-research-configuration';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import {
	AgentPreferenceRecords,
	AgentRunRecords,
	AgentSessionRecords
} from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { ToolPreferenceRecords } from '$lib/server/repositories/agent/postgres/tool-preferences';
import { TrustPolicyRecords } from '$lib/server/repositories/agent/postgres/trust-policies';
import {
	ConversationArchive,
	type ConversationMessages,
	type ConversationSessions
} from '$lib/server/services/agent/conversations/archive';
import {
	ConversationHistoryService,
	type ConversationHistory
} from '$lib/server/services/agent/conversations/history';
import { RunApprovals, type RunApprovalDecisions } from '$lib/server/services/agent/runs/approvals';
import {
	RunCancellation,
	type RunCancellationDecisions
} from '$lib/server/services/agent/runs/cancellation';
import {
	RunCheckpoints,
	type RunCheckpointWriter
} from '$lib/server/services/agent/runs/checkpoints';
import type { IAgentContext } from '$lib/server/services/agent/runs/context';
import {
	AgentImagePreparationService,
	type AgentImagePreparation
} from '$lib/server/services/agent/runs/images';
import { AgentPromptService } from '$lib/server/services/agent/runs/instructions';
import { AgentRunLedger, type WorkflowRunLedger } from '$lib/server/services/agent/runs/ledger';
import {
	NoteActionRequests,
	type NoteActionSubmission
} from '$lib/server/services/agent/runs/note-action-requests';
import {
	AgentModels,
	AgentPreferenceCatalog,
	type AgentModelCatalog,
	type AgentPreferenceEditor
} from '$lib/server/services/agent/runs/preferences';
import {
	RunPreparation,
	type ChatRunPreparation
} from '$lib/server/services/agent/runs/preparation';
import { RunSettlements, type RunSettlement } from '$lib/server/services/agent/runs/settlement';
import {
	AgentStreamPresentationService,
	type AgentStreamPresentation
} from '$lib/server/services/agent/runs/stream-presentation';
import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import {
	ToolTrust,
	type TrustPolicyEvaluator,
	type TrustPolicyStore
} from '$lib/server/services/agent/runs/tool-trust';
import {
	ToolAccess,
	type ToolPreferenceCapability
} from '$lib/server/services/agent/tools/preferences';
import { traceAgentTurn, traceContextReader } from '$lib/server/infrastructure/telemetry/tracing';
import { RunSignalService, type RunSignals } from '$lib/server/services/agent/runs/signals';
import { AgentRunNotificationRecords } from '$lib/server/repositories/agent/postgres/run-notifications';
import type { NotificationChannel } from '$lib/server/db';
import {
	AgentModelChoiceService,
	AgentModelSelectionService,
	type IAgentModelChoiceService,
	type IAgentModelSelectionService
} from '$lib/services/agent/model-selection';
import {
	AgentPreferenceEditingService,
	type AgentPreferenceEditing
} from '$lib/services/agent/preferences';
import { AgentRunSettingsService, type AgentRunSettings } from '$lib/services/agent/run-settings';
import { AgentRunStatusService, type AgentRunStatusRules } from '$lib/services/agent/run-status';
import { AgentToolCatalogService, type AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import {
	ToolActivityProjection,
	type ToolActivityReader
} from '$lib/server/services/agent/conversations/tool-activity';
import type { TraceContextReader } from '$lib/models/telemetry';
import { OpenRouter } from '@openrouter/sdk';

export interface AgentCapabilityInput {
	readonly tokens: TokenCounter;
	readonly db: Database;
	readonly notifications: NotificationChannel;
	readonly controllers: () => ControllerFactory;
	readonly toolRetriever: AgentToolDiscoveryServices;
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
	readonly streamPresentation: AgentStreamPresentation;
	readonly conversationHistory: ConversationHistory;
	readonly imagePreparation: AgentImagePreparation;
	readonly preferenceEditing: AgentPreferenceEditing;
	readonly mcpSurface: McpSurfaceFactory;
	readonly now: () => DateTime;
	readonly runSettings: AgentRunSettings;
	readonly webSearchOverrides: WebResearchOptions;
	readonly agentAvailable: boolean;
	readonly conversations: ConversationSessions;
	readonly conversationMessages: ConversationMessages;
	readonly toolActivity: ToolActivityReader;
	readonly traceContext: TraceContextReader;
	readonly preferences: AgentPreferenceEditor;
	readonly models: AgentModelCatalog;
	readonly modelSelection: IAgentModelSelectionService;
	readonly modelChoices: IAgentModelChoiceService;
	readonly toolPreferences: ToolPreferenceCapability;
	readonly toolCatalog: AgentToolCatalog;
	readonly trust: TrustPolicyStore & TrustPolicyEvaluator;
	readonly cancellations: RunCancellationDecisions;
	readonly approvals: RunApprovalDecisions;
	readonly preparation: ChatRunPreparation;
	readonly checkpoints: RunCheckpointWriter;
	readonly runLedger: WorkflowRunLedger;
	readonly sessions: AgentSessionRepository;
	/** The run records the agent harness reads and writes, through their services. */
	readonly harnessRecords: {
		readonly runs: AgentRuns;
		readonly events: AgentRunEvents;
		readonly decisions: AgentRunDecisions;
		readonly sessions: AgentSessions;
	};
	readonly context: IAgentContext;
	readonly turns: AgentTurns;
	readonly prompts: AgentPromptPreparation;
	readonly toolRecovery: AgentToolRecovery;
	readonly toolApproval: AgentToolApprovalPolicy;
	readonly toolConstruction: AgentToolConstruction;
	readonly observeTurn: AgentTurnObserver;
	readonly settlements: RunSettlement;
	readonly noteActionRequests: NoteActionSubmission;
	readonly runSignals: RunSignals;
}

export const createAgentCapability = (
	actor: ActorContext,
	input: AgentCapabilityInput
): AgentCapability => {
	const conversationRepository = new ConversationRecords(actor, input.db);
	const conversations = new ConversationArchive(actor, conversationRepository);
	const preferences = new AgentPreferenceCatalog(
		actor,
		new AgentPreferenceRecords(actor, input.db)
	);
	const models =
		input.modelCatalog ??
		new AgentModels(
			new OpenRouter({
				apiKey: input.openRouterApiKey,
				httpReferer: input.appURL,
				xTitle: 'FollowThrough'
			}).models,
			new Set(input.recommendedModels.map(normalizeLanguageModelId))
		);
	const tokens = input.tokens;
	const runs = new AgentRunRecords(actor, input.db);
	const runLedger = new AgentRunLedger(actor, runs);
	const runEvents = new AgentRunEventRecords(actor, input.db);
	const settlements = new RunSettlements(runs, runEvents);
	const runDecisions = new AgentRunDecisionRecords(actor, input.db);
	const sessions = new AgentSessionRecords(actor, input.db);
	const runSignals = new RunSignalService(
		new AgentRunNotificationRecords(input.notifications),
		runs
	);
	const context = createAgentContext(tokens);
	const toolPreferences = new ToolAccess(new ToolPreferenceRecords(actor, input.db));
	return {
		mcpSurface: createMcpToolSurface,
		imagePreparation: new AgentImagePreparationService(),
		runStatus: new AgentRunStatusService(),
		streamPresentation: new AgentStreamPresentationService(),
		runSettings: new AgentRunSettingsService(),
		webSearchOverrides: webSearchOptionsFromEnvironment(process.env),
		agentAvailable: Boolean(input.openRouterApiKey.trim()),
		now: () => new Date().toISOString() as DateTime,
		conversations,
		conversationMessages: conversations,
		toolActivity: new ToolActivityProjection(),
		traceContext: traceContextReader,
		conversationHistory: new ConversationHistoryService(sessions, input.files, tokens),
		preferences,
		models,
		preferenceEditing: new AgentPreferenceEditingService(),
		modelSelection: new AgentModelSelectionService(),
		modelChoices: new AgentModelChoiceService(),
		toolPreferences,
		toolCatalog: new AgentToolCatalogService(),
		trust: new ToolTrust(actor, new TrustPolicyRecords(actor, input.db)),
		cancellations: new RunCancellation(runs),
		approvals: new RunApprovals(runs),
		preparation: new RunPreparation(runs),
		checkpoints: new RunCheckpoints(runs),
		runLedger,
		sessions,
		harnessRecords: {
			runs: new AgentRunService(runs),
			events: new AgentRunEventService(actor, runEvents),
			decisions: new AgentRunDecisionService(actor, runDecisions),
			sessions: new AgentSessionService(actor, sessions)
		},
		context,
		turns: new AgentTurnService(
			createAgentProviders({
				apiKey: input.openRouterApiKey,
				baseURL: input.openRouterBaseURL,
				appURL: input.appURL
			})
		),
		prompts: new AgentPromptService(),
		toolRecovery: new AgentToolRecoveryService(),
		toolApproval: new AgentToolApprovalRules(),
		toolConstruction: createAgentToolConstruction(input.controllers),
		observeTurn: traceAgentTurn,
		settlements,
		noteActionRequests: new NoteActionRequests(actor, runs, runEvents, conversationRepository),
		runSignals
	};
};
