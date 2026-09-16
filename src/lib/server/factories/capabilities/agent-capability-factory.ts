import { RunRecovery } from '$lib/server/controllers/run-recovery/controller';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
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
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { ConversationBuffer } from '$lib/server/services/agent/conversations/buffer';
import { AgentContext } from '$lib/server/services/agent/runs/context';
import { AgentEvents } from '$lib/server/services/agent/runs/events';
import { AgentRunLedger } from '$lib/server/services/agent/runs/ledger';
import { AgentRunLifecycle } from '$lib/server/controllers/agent-execution/controller';
import { registerActiveRun, releaseActiveRun } from '$lib/server/services/agent/runs/active-runs';
import {
	AgentModels,
	AgentPreferenceCatalog,
	type AgentModelCatalog
} from '$lib/server/services/agent/runs/preferences';
import { AgentReasoning } from '$lib/server/services/agent/runs/reasoning';
import { ToolTrust } from '$lib/server/services/agent/runs/tool-trust';
import { WorkflowRunner } from '$lib/server/controllers/workflow-execution/controller';
import { ToolAccess } from '$lib/server/services/agent/tools/preferences';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import type { MemoryLibrary } from '$lib/server/services/memory/library';
import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { ProjectCatalog } from '$lib/server/services/projects/catalog';
import type { BuiltInSkillProvisioner, SkillFinder } from '$lib/server/services/skills/contracts';
import { traceAgentTurn } from '$lib/server/services/telemetry';
import { agentToolCatalog } from '$lib/server/factories/agent/agent-tool-catalog-factory';
import { agentToolRegistry } from '$lib/server/factories/agent/agent-tool-factory';
import type { ProductionControllerFactory } from '$lib/server/factories/production-controller-factory';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import { AgentReplayVirtualizer } from '$lib/server/services/agent/conversations/replay-virtualizer';

export interface AgentCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: TransactionRunner;
	readonly controllers: () => ProductionControllerFactory;
	readonly toolRetriever: ToolRetriever;
	readonly notes: NoteCatalog;
	readonly skills: SkillFinder;
	readonly builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'>;
	readonly projects: ProjectCatalog;
	readonly memory: MemoryLibrary;
	readonly provenance: ProvenanceRecorder;
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
	readonly conversations: ConversationArchive;
	readonly preferences: AgentPreferenceCatalog;
	readonly models: AgentModelCatalog;
	readonly toolPreferences: ToolAccess;
	readonly trust: ToolTrust;
	readonly runs: AgentRunRecords;
	readonly runLedger: AgentRunLedger;
	readonly runEvents: AgentRunEventRecords;
	readonly runDecisions: AgentRunDecisionRecords;
	readonly sessions: AgentSessionRecords;
	readonly context: AgentContext;
	readonly executor: AgentRunLifecycle;
	readonly eventBus: AgentEvents;
	/** Runs the editor's note actions as cancellable, resumable agent runs. */
	readonly workflowRunner: WorkflowRunner;
	readonly recovery: RunRecovery;
}

export const createAgentCapability = (input: AgentCapabilityInput): AgentCapability => {
	const conversations = new ConversationArchive(new ConversationRecords(input.db));
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
	const settlements = new RunSettlements(runs, runEvents, input.transactionRunner);
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
	const executor = new AgentRunLifecycle({
		settlements,
		runs,
		events: runEvents,
		decisions: runDecisions,
		sessions,
		transactions: input.transactionRunner,
		contextFormatter: context,
		contextNotes: input.notes,
		contextSkills: input.skills,
		builtInSkills: input.builtInSkills,
		contextMemory: input.memory,
		contextProjects: input.projects,
		contextConversations: conversations,
		provenance: input.provenance,
		conversations,
		runner,
		eventBus
	});

	return {
		conversations,
		preferences,
		models,
		toolPreferences: new ToolAccess(new ToolPreferenceRecords(input.db), agentToolCatalog),
		trust: new ToolTrust(new TrustPolicyRecords(input.db)),
		runs,
		runLedger,
		runEvents,
		runDecisions,
		sessions,
		context,
		workflowRunner: new WorkflowRunner({
			settlements,
			transactions: input.transactionRunner,
			runs,
			events: runEvents,
			conversations,
			eventBus,
			activeRuns: {
				register: registerActiveRun,
				release: releaseActiveRun
			},
			defaultModel: normalizeLanguageModelId(input.defaultModel)
		}),
		executor,
		recovery: new RunRecovery(runs, executor, settlements, eventBus),
		eventBus
	};
};
