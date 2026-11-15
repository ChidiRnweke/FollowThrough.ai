import { RunPreparationCancelled } from '$lib/errors';
import {
	CHAT_WEB_SEARCH_DEFAULTS,
	DEFAULT_AGENT_MAX_TURNS,
	type WebResearchOptions,
	type RunToolName
} from '$lib/models/agent';
import type { RunAdmissionRule } from '$lib/server/services/agent/runs/admission';
import type { AgentImagePreparation } from '$lib/server/services/agent/runs/images';
import type { RunTransitionStore } from '$lib/server/services/agent/runs/transitions';
import type { AgentStreamPresentation } from '$lib/server/services/agent/runs/stream-presentation';
import type {
	IAgentModelChoiceService,
	IAgentModelSelectionService
} from '$lib/services/agent/model-selection';
import type { AgentRunSettings } from '$lib/services/agent/run-settings';
import type { AgentRunStatusRules } from '$lib/services/agent/run-status';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import { ConflictError, NotFoundError, ValidationError } from '$lib/errors';
import type {
	AgentEvent,
	AgentPreferences,
	AgentModel,
	AgentRun,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunReceipt,
	AgentRunSnapshot,
	Conversation,
	ConversationId,
	DecideAgentRunBatchInput,
	DecideAgentRunInput,
	PersistedSessionItem,
	ResolvedAgentRun,
	RunAgentInput,
	AgentExecutionUpdate,
	AgentRunImages,
	WebResearchSettings,
	AgentRunDecisionRecord,
	ProviderToolCall,
	AgentExecutionMode,
	StagedAgentRunInput,
	StoredAgentRunEventRecord,
	SubmitAgentRunInput
} from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type {
	ConversationMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type {
	AgentModelCatalog,
	AgentPreferencesStore
} from '$lib/server/services/agent/runs/preferences';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

import { AgentProviderFailure } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { AgentFileReferences } from '$lib/server/services/agent-files/virtual-files';
import type { ConversationHistory } from '$lib/server/services/agent/conversations/history';
import type { AttachedResource, IAgentContext } from '$lib/server/services/agent/runs/context';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { AttachmentLookup, AttachmentReader } from '$lib/server/services/attachments/library';
import type { ProjectContextUsage } from '$lib/server/services/context-usage/usage';
import type { ConnectionAnalysis } from '$lib/services/context-usage/connections';
import type { DiagramFinder } from '$lib/server/services/diagrams/library';
import type { NoteReader } from '$lib/server/services/notes/catalog';
import type { TraceContextReader } from '$lib/models/telemetry';
import type { WidgetReader } from '$lib/server/services/widgets/library';

import type {
	AgentRunContext,
	AgentRunExecutionOutcome,
	ContextResourceRef,
	PreparedAgentRun
} from '$lib/models/agent';
import type {
	ConversationMessages,
	ConversationSessions
} from '$lib/server/services/agent/conversations/archive';
import type { ToolActivityReader } from '$lib/server/services/agent/conversations/tool-activity';
import type {
	McpToolSession,
	AgentTool,
	AgentToolCompletion,
	AgentToolPlan,
	AgentToolPolicy,
	AgentToolset,
	ConnectorAgentTool,
	ConnectorToolBuild
} from '$lib/models/agent-tool-protocol';
import type { ConnectorToolName } from '$lib/models/connectors';
import type { ConnectorToolSource } from '$lib/server/services/connectors/directory';
import type { ConnectorToolPolicyRule } from '$lib/services/connectors/policy';
import type { AgentToolContext, McpToolContext } from '$lib/models/agent-tool-context';
import type { AgentPayload } from '$lib/models/agent/payload';
import { FIRST_CLASS_TOOL_NAMES, type ToolName } from '$lib/models/agent/tool-catalog';
import type { McpScope } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
import type { AgentPromptPreparation } from '$lib/server/services/agent/runs/instructions';
import type { AgentToolRecovery } from '$lib/server/services/agent/runs/tool-recovery';
import type { AgentProviderTurn, AgentTurns } from '$lib/server/services/agent/runs/turns';
import type { ToolPreferenceCapability } from '$lib/server/services/agent/tools/preferences';
import type { ToolRanking } from '$lib/server/services/agent/tools/tool-search';
import type { AgentToolApprovalPolicy } from '$lib/services/agent/tool-approval';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import type { AgentHarnessRecords } from '$lib/server/services/agent/runs/records';
import type { MemoryEntryLister } from '$lib/server/services/memory/library';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { ProjectReader, ProjectTreeReader } from '$lib/server/services/projects/catalog';
import type {
	BuiltInSkillProvisioner,
	BuiltInSkillSelection
} from '$lib/server/services/skills/built-ins';
import type { SkillFinder } from '$lib/server/services/skills/library';
import type { RunSignals } from '$lib/server/services/agent/runs/signals';
import type {
	Schedule,
	ScheduleId,
	ScheduleOccurrence,
	ScheduleOccurrenceId,
	ScheduleRunStart
} from '$lib/models/schedules';
import type { ScheduleWriter } from '$lib/server/services/schedules/library';
import type { ScheduleRunLog } from '$lib/server/services/schedules/runs';
import type { ScheduleDue } from '$lib/services/schedules/rules';
/** Grace period the executor gets to settle a cancelled run before the backstop does it. */
const CANCELLATION_GRACE_MS = 10_000;

class DuplicateSubmission extends Error {}

/** What an occurrence of a schedule records before its run is saved. */
type OccurrenceStart = Pick<ScheduleOccurrence, 'id' | 'trigger' | 'scheduledFor' | 'createdAt'>;

/** A run built for saving, with the input its first message is recorded from. */
interface StagedRun {
	readonly run: ResolvedAgentRun;
	readonly runInput: StagedAgentRunInput;
}

interface AgentTurnContext {
	readonly input: string;
	readonly sessionId: string;
	readonly model: string;
	readonly userId?: string;
	readonly runId?: string;
	readonly parentTraceparent?: string;
	readonly onRoot?: (traceparent: string) => void;
}

/** Wraps one model turn in an observation; the turn's output text is read when it ends. */
export type AgentTurnObserver = <T>(
	context: AgentTurnContext,
	operation: () => AsyncIterable<T>,
	output: () => string
) => AsyncIterable<T>;

/**
 * Application boundary for the agent: submitting runs, streaming their events, and
 * managing the conversations (chats) they happen in. Controllers know nothing about
 * transports; this one deals in run receipts, snapshots, and event cursors.
 */
export interface AgentHarness {
	execute(runId: AgentRunId, signal: AbortSignal): Promise<AgentRunExecutionOutcome>;
	/**
	 * The tools an MCP request may call: the user's tool selection applies, and a read-scoped
	 * token reaches only read tools.
	 */
	openMcpTools(scope: McpScope, provenanceId: ProvenanceId): Promise<McpToolSession>;
	finishCancellation(runId: AgentRunId): Promise<AgentRun | undefined>;
	failRun(runId: AgentRunId, error: Error): Promise<void>;
	/** Settle a run the previous process left running or cancelling. */
	/**
	 * Starts the run of a schedule whose time has come, as its owner (ADR 0052). The worker calls
	 * this for each due schedule; a schedule that is not due, or whose earlier run still waits
	 * for approval, starts nothing.
	 */
	runDueSchedule(scheduleId: ScheduleId): Promise<ScheduleRunStart>;
	/**
	 * Starts one run of a schedule now, whatever its state, and leaves its next run where it is.
	 * A repeated request with the same key returns the run it already started.
	 * @throws NotFoundError if the actor has no such schedule.
	 */
	runScheduleNow(input: {
		readonly scheduleId: ScheduleId;
		readonly requestId: string;
	}): Promise<AgentRunReceipt>;
	recoverInterrupted(runId: AgentRunId): Promise<void>;
	/** Start a run the previous process queued but never started. */
	resumeQueued(runId: AgentRunId): Promise<void>;
	synchronize(input: ConversationMutationRequest): Promise<WorkspaceMutationResult>;
	/**
	 * Queue an agent run for the given prompt and return a receipt for the queued run.
	 *
	 * Idempotent on `input.requestId`: a repeated submission returns the receipt of the
	 * run that already consumed that request id rather than queueing a second run, so a
	 * client retry after a dropped response cannot double-fire the agent.
	 *
	 * The user's current limits and preferences are frozen onto the run at submission
	 * time; a run replayed later runs under the settings it was submitted with, not
	 * whatever they have since become. The chat model itself is only settled after the
	 * conversation is resolved, because the model can depend on the conversation's own
	 * preferences. Execution is kicked off only after the enclosing transaction commits,
	 * so a failure to queue never leaks a run that was never meant to run.
	 *
	 * @throws ValidationError if an explicit model is not selectable, more than four
	 * images are attached, or an image is not a supported type within the size limit.
	 */
	submit(input: SubmitAgentRunInput): Promise<AgentRunReceipt>;
	/**
	 * Fetch a single run as a snapshot (the run plus its latest event cursor and pending
	 * decisions) so a client can resume the event stream and render approval cards.
	 *
	 * @throws NotFoundError if no run exists for `runId`.
	 */
	getRun(runId: AgentRunId): Promise<AgentRunSnapshot>;
	/**
	 * Signal `listener` whenever the actor's run records a new event. The signal carries no
	 * data: read the events with {@link listRunEvents}. Returns the unsubscribe function.
	 *
	 * @throws NotFoundError if no run exists for `runId`.
	 */
	observeRun(runId: AgentRunId, listener: () => void): Promise<() => Promise<void>>;
	/** Close event delivery only after a terminal run's durable tail has been delivered. */
	isRunStreamComplete(runId: AgentRunId, deliveredCursor: string): Promise<boolean>;
	/**
	 * Replay events for a run after the given cursor, for a client that polls the event
	 * stream while a run executes. The cursor is the opaque continuation returned by the
	 * previous append, so a client never re-reads events it already saw.
	 */
	listRunEvents(runId: AgentRunId, after: string): Promise<readonly StoredAgentRunEventRecord[]>;
	/**
	 * Approve or reject a single pending tool call. Delegates to {@link decideMany};
	 * kept as a convenience so callers need not wrap one call id in a batch.
	 */
	decide(input: DecideAgentRunInput): Promise<AgentRunSnapshot>;
	/**
	 * Record approvals or rejections for several pending tool calls and requeue the run
	 * for continued execution.
	 *
	 * The batch is all-or-nothing: every call id must currently be pending, otherwise
	 * nothing is recorded. A partial batch against a run that then requeues would leave
	 * the user staring at approval cards whose decision silently went nowhere.
	 *
	 * @throws ValidationError if the run is not awaiting approval or any call id is not
	 * pending.
	 */
	decideMany(input: DecideAgentRunBatchInput): Promise<AgentRunSnapshot>;
	/**
	 * Request cancellation of a run, aborting any in-process execution immediately.
	 *
	 * When the run was still queued the cancellation is also recorded as an event so the
	 * client's event stream explains why the run never produced output.
	 */
	cancel(runId: AgentRunId): Promise<AgentRunSnapshot>;
	/**
	 * Requeue a failed or cancelled run under the input snapshot it was originally frozen
	 * with, returning a receipt for the new run.
	 *
	 * Only failed or cancelled runs may be retried — a completed run is never replayed —
	 * and the new run carries the original's frozen model, execution mode, and input so a
	 * retry is a faithful replay rather than a fresh submission. Like {@link submit}, it
	 * is idempotent on `requestId`.
	 *
	 * @throws ValidationError if the original run is neither failed nor cancelled.
	 */
	retry(runId: AgentRunId, requestId: string): Promise<AgentRunReceipt>;
	/**
	 * List the user's conversations, newest first, optionally filtered by free-text
	 * `query` and paginated by `limit`/`offset`.
	 */
	listSessions(options?: {
		readonly limit?: number;
		readonly offset?: number;
		readonly query?: string;
	}): Promise<readonly Conversation[]>;
	/**
	 * Change a conversation's title as it appears in the conversation list.
	 */
	renameSession(conversationId: ConversationId, title: string): Promise<Conversation>;
	/**
	 * Delete a conversation and its message history.
	 *
	 * Refused while the conversation has an active agent run: deleting the transcript out
	 * from under a run that is still executing would strand it. Stop or resolve the run
	 * first.
	 *
	 * @throws ValidationError if the conversation has an active run.
	 */
	deleteSession(conversationId: ConversationId): Promise<void>;
}

/** Connectors are off where the deployment cannot seal their credentials. */
export type HarnessConnectors =
	| { readonly kind: 'off' }
	| {
			readonly kind: 'on';
			readonly source: ConnectorToolSource;
			readonly policy: ConnectorToolPolicyRule;
	  };

/**
 * Everything the {@link AgentHarness} needs to do its work, injected so the
 * controller can be built and tested with repository and provider fakes.
 */
export interface AgentHarnessDependencies {
	/** The process clock, shared by every capability that stamps time. */
	readonly now: () => DateTime;
	readonly runStatus: AgentRunStatusRules;
	readonly streamPresentation: AgentStreamPresentation;
	readonly conversationHistory: ConversationHistory;
	readonly imagePreparation: AgentImagePreparation;
	readonly modelSelection: IAgentModelSelectionService;
	readonly modelChoices: IAgentModelChoiceService;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	/** Persists conversations and their message history. */
	conversationSessions: ConversationSessions;
	conversationMessages: ConversationMessages;
	/** Reads which tool call an event opens or settles. */
	toolActivity: ToolActivityReader;
	/** Links a run to the operation that started it, so its turns join that trace. */
	traceContext: TraceContextReader;
	/** Per-user agent preferences used to settle defaults when a run is frozen. */
	preferences: AgentPreferencesStore;
	/** The catalogue of selectable models, used to validate and resolve run models. */
	models: AgentModelCatalog;
	/** Run records: idempotent inserts, lookups, the per-run event log, recorded approval decisions
	 * and the provider session items replaced wholesale when a conversation is rewound. */
	records: AgentHarnessRecords;
	/** Every run state transition: approval, cancellation, checkpoint and chat-run preparation. */
	transitions: RunTransitionStore;
	/** Executes run mutations atomically so a run is all-or-nothing. */
	transactionRunner: TransactionRunner;
	/** Whether one more chat run may start beside the runs that execute now (ADR 0053). */
	readonly runAdmission: RunAdmissionRule;
	/** Deployment fallback chat model when the user has not chosen one. */
	defaultModel: string;
	/** Deployment fallback vision model when the user has not chosen one. */
	defaultVisionModel: string;
	readonly runSettings: AgentRunSettings;
	webSearchOverrides: WebResearchOptions;

	readonly settlements: RunSettlement;

	readonly contextFormatter: IAgentContext;

	readonly contextNotes: NoteReader;

	readonly contextSkills: Pick<SkillFinder, 'listEnabled'>;

	readonly contextWidgets: WidgetReader;

	readonly contextDiagrams: DiagramFinder;

	readonly contextAttachments: AttachmentLookup;
	readonly contextFiles: AgentFileReferences;

	/**
	 * An attached connection map is read along the path the Connections tab takes: the
	 * project's holdings, then what the agent read together among them, as tables.
	 */
	readonly contextProjectTree: ProjectTreeReader;
	readonly contextProjectAttachments: Pick<AttachmentReader, 'listForProject'>;
	readonly contextConnections: Pick<ProjectContextUsage, 'connect'>;
	readonly connectionTables: Pick<ConnectionAnalysis, 'tables'>;

	readonly builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'> & BuiltInSkillSelection;

	readonly contextMemory: MemoryEntryLister;

	readonly contextProjects: ProjectReader;

	readonly provenance: ProvenanceRecorder;

	/** The model provider's turns through the agents SDK. */
	readonly turns: AgentTurns;
	readonly prompts: AgentPromptPreparation;
	readonly toolRecovery: AgentToolRecovery;
	/** False until the deployment configures a model provider key. */
	readonly agentAvailable: boolean;
	/** Every tool an in-app run may call; the harness decides which it offers and how. */
	readonly tools: (context: AgentToolContext) => readonly AgentTool[];
	/** Every tool an MCP client may call. */
	readonly mcpTools: (context: McpToolContext) => readonly AgentTool[];
	/** The connector tools a run offers, built from their stored snapshots (ADR 0049). */
	readonly connectorTools: (builds: readonly ConnectorToolBuild[]) => readonly ConnectorAgentTool[];
	/** Turns a run's tools and the harness's policy into the tools the SDK calls. */
	readonly toolset: (
		tools: readonly AgentTool[],
		connectorTools: readonly ConnectorAgentTool[],
		policy: AgentToolPolicy
	) => AgentToolset;
	/** The user's connector tools, when this deployment can hold connectors at all. */
	readonly connectors: HarnessConnectors;
	readonly toolPreferences: Pick<ToolPreferenceCapability, 'view'>;
	readonly toolCatalog: AgentToolCatalog;
	readonly toolApproval: Pick<AgentToolApprovalPolicy, 'requirement' | 'connectorRequirement'>;
	readonly toolSearch: ToolRanking;
	/** Wraps each model turn in its trace. */
	readonly observeTurn: AgentTurnObserver;

	/** Run changes are published by the database on commit; this listens for them. */
	readonly runSignals: RunSignals;

	/** The schedule a due run is started for: locked, decided and moved on in one transaction. */
	readonly schedules: Pick<ScheduleWriter, 'getForChange' | 'save'>;
	readonly scheduleRules: ScheduleDue;
	readonly scheduleRuns: ScheduleRunLog;
}

/**
 * The agent harness on the OpenAI agents SDK: it runs each turn over the injected tool list,
 * applying discovery, approval, review and tool preferences, and owns the run lifecycle.
 */
export class AgentSdkHarness implements AgentHarness {
	async synchronize(input: ConversationMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: ConversationMutationRequest): Promise<void> {
		await this.renameSession(input.command.conversationId, input.command.title);
	}
	constructor(
		private readonly actor: ActorContext,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: AgentHarnessDependencies
	) {}

	listSessions(options?: {
		readonly limit?: number;
		readonly offset?: number;
		readonly query?: string;
	}): Promise<readonly Conversation[]> {
		return this.dependencies.conversationSessions.listConversations(options);
	}

	renameSession(conversationId: ConversationId, title: string): Promise<Conversation> {
		return this.dependencies.conversationSessions.rename(conversationId, title);
	}

	async deleteSession(conversationId: ConversationId): Promise<void> {
		await this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.conversationSessions.getForWrite(conversationId);
			const active = await this.dependencies.records.findActiveByConversation(conversationId);
			if (active)
				throw new ValidationError('Stop or resolve the active agent run before deleting this chat');
			await this.dependencies.conversationSessions.remove(conversationId);
		});
	}

	async submit(input: SubmitAgentRunInput): Promise<AgentRunReceipt> {
		const existing = await this.dependencies.records.findByRequestId(input.requestId);
		if (existing) return this.receipt(existing);
		if (input.model) {
			const issue = this.dependencies.modelChoices.modelChoiceIssue(
				await this.selectableModels(),
				input.model,
				'chat'
			);
			if (issue) throw new ValidationError(issue);
		}
		try {
			const receipt = await this.dependencies.transactionRunner.run(async () => {
				// Limits are frozen onto the input alongside the prompt: a run replayed
				// later should run under the settings it was submitted with, not
				// whatever they have since become.
				const preferences = await this.dependencies.preferences.get();
				const runInput = this.freezeInput(input, preferences);
				const conversation = await this.dependencies.conversationSessions.getOrCreate(runInput);
				if (input.retryUserOrdinal !== undefined)
					await this.rewind(conversation.id, input.retryUserOrdinal);
				const staged = await this.stage(conversation, runInput, input.requestId, preferences);
				await this.admitRequested(input.requestId);
				return this.saveQueued(staged);
			});
			this.executeInBackground(receipt.runId);
			return receipt;
		} catch (error) {
			if (!(error instanceof DuplicateSubmission)) this.raiseActiveRunConflict(error);
			const duplicate = await this.dependencies.records.findByRequestId(input.requestId);
			if (!duplicate) throw error;
			return this.receipt(duplicate);
		}
	}

	async runDueSchedule(scheduleId: ScheduleId): Promise<ScheduleRunStart> {
		const start = await this.dependencies.transactionRunner.run(
			async (): Promise<ScheduleRunStart> => {
				// The lock makes the decision single: a second worker waits here, then reads a
				// schedule whose next run has already moved on.
				const schedule = await this.dependencies.schedules.getForChange(scheduleId);
				const now = this.dependencies.now();
				const decision = this.dependencies.scheduleRules.due(
					schedule,
					now,
					await this.dependencies.scheduleRuns.hasWaitingRun(scheduleId)
				);
				if (decision.kind === 'not_due') return decision;
				await this.dependencies.schedules.save(decision.schedule);
				if (decision.kind === 'skipped') return { kind: 'skipped' };
				const occurrence: OccurrenceStart = {
					id: crypto.randomUUID() as ScheduleOccurrenceId,
					trigger: 'recurrence',
					scheduledFor: decision.scheduledFor,
					createdAt: now
				};
				const staged = await this.stageScheduled(schedule, occurrence);
				const admission = this.dependencies.runAdmission.admit(
					await this.dependencies.records.lockExecutingCounts()
				);
				// Nobody is present to be told no. A refused occurrence is saved as a failed run, so
				// its owner reads why on the schedule's page and in its chat. The schedule has already
				// moved on, so the next occurrence is admitted on its own.
				const receipt =
					admission.kind === 'admitted'
						? await this.saveQueued(staged)
						: await this.saveRefused(
								staged,
								this.dependencies.runAdmission.refusal(admission, 'scheduled')
							);
				await this.recordOccurrence(schedule, occurrence, receipt);
				return { kind: admission.kind === 'admitted' ? 'started' : 'refused', receipt };
			}
		);
		if (start.kind === 'started') this.executeInBackground(start.receipt.runId);
		return start;
	}

	async runScheduleNow(input: {
		readonly scheduleId: ScheduleId;
		readonly requestId: string;
	}): Promise<AgentRunReceipt> {
		const existing = await this.dependencies.records.findByRequestId(input.requestId);
		if (existing) return this.receipt(existing);
		const run = async () =>
			this.dependencies.transactionRunner.run(async () => {
				const schedule = await this.dependencies.schedules.getForChange(input.scheduleId);
				const now = this.dependencies.now();
				const occurrence: OccurrenceStart = {
					id: input.requestId as ScheduleOccurrenceId,
					trigger: 'manual',
					scheduledFor: now,
					createdAt: now
				};
				const staged = await this.stageScheduled(schedule, occurrence);
				// Its owner asked just now, so a refusal is told to them and nothing is saved.
				await this.admitRequested(occurrence.id);
				const receipt = await this.saveQueued(staged);
				await this.recordOccurrence(schedule, occurrence, receipt);
				return receipt;
			});
		let receipt: AgentRunReceipt;
		try {
			receipt = await run();
		} catch (error) {
			// A repeated "Run now" with the same request key answers with the run it started.
			if (!(error instanceof DuplicateSubmission)) throw error;
			const duplicate = await this.dependencies.records.findByRequestId(input.requestId);
			if (!duplicate) throw error;
			return this.receipt(duplicate);
		}
		this.executeInBackground(receipt.runId);
		return receipt;
	}

	/**
	 * Saves the chat of one run of a schedule and builds its run, inside the caller's
	 * transaction. The occurrence's id is the run's request key.
	 *
	 * The schedule's project, model and skills are passed on as they are stored and are not
	 * checked here. A check that failed in this transaction would roll back the move to the
	 * next occurrence, and the worker would find the schedule due again on every tick. The run
	 * checks them when it starts, and fails where its owner can read why.
	 */
	private async stageScheduled(
		schedule: Schedule,
		occurrence: Pick<ScheduleOccurrence, 'id' | 'scheduledFor'>
	): Promise<StagedRun> {
		const preferences = await this.dependencies.preferences.get();
		const runInput: StagedAgentRunInput = {
			...this.freezeInput(
				{
					requestId: occurrence.id,
					input: schedule.prompt,
					mode: schedule.executionMode,
					...(schedule.projectId ? { projectId: schedule.projectId } : {}),
					...(schedule.model ? { model: schedule.model } : {}),
					...(schedule.skillNoteIds.length > 0
						? { requestedSkillNoteIds: schedule.skillNoteIds }
						: {})
				},
				preferences
			),
			schedule: {
				scheduleId: schedule.id,
				title: schedule.title,
				scheduledFor: occurrence.scheduledFor,
				timeZone: schedule.timeZone
			}
		};
		const conversation = await this.dependencies.conversationSessions.getOrCreate(runInput);
		return this.stage(conversation, runInput, occurrence.id, preferences);
	}

	private async recordOccurrence(
		schedule: Schedule,
		occurrence: OccurrenceStart,
		receipt: AgentRunReceipt
	): Promise<void> {
		await this.dependencies.scheduleRuns.record({
			...occurrence,
			userId: this.actor.userId,
			scheduleId: schedule.id,
			conversationId: receipt.conversationId,
			runId: receipt.runId
		});
	}

	/**
	 * Builds the queued run for a conversation's next prompt. Nothing is saved: the caller decides
	 * on admission first, because building it may read the model catalog, and the admission lock
	 * should not wait on that.
	 */
	private async stage(
		conversation: Conversation,
		runInput: StagedAgentRunInput,
		requestId: string,
		preferences: AgentPreferences
	): Promise<StagedRun> {
		const submittedAt = this.dependencies.now();
		const model = this.dependencies.modelSelection.resolveAgentModel(
			conversation,
			preferences,
			this.dependencies.defaultModel
		);
		// Settled only now, because it depends on the chat model, which is not
		// known until the conversation has been resolved.
		const finalInput = await this.withImageReader(
			// The snapshot names the conversation the run belongs to, not merely the
			// one the client knew about: on a chat's first message the client has no
			// id yet, and a run's own record of itself should not have that gap.
			{ ...runInput, conversationId: conversation.id },
			model,
			conversation,
			preferences
		);
		// Seeds the run with the requesting operation's span, so the first
		// turn joins this request's trace even though execution starts
		// after this transaction commits. Approval parks refresh it.
		const submittedTraceparent = this.dependencies.traceContext.activeTraceparent();
		const run: ResolvedAgentRun = {
			kind: 'agent',
			id: crypto.randomUUID() as AgentRunId,
			userId: this.actor.userId,
			conversationId: conversation.id,
			model,
			executionMode: this.dependencies.runSettings.executionMode(conversation, preferences),
			status: 'queued',
			requestId,
			pendingDecisions: [],
			inputSnapshot: finalInput,
			...(submittedTraceparent ? { traceparent: submittedTraceparent } : {}),
			definitionVersion: 2,
			createdAt: submittedAt,
			updatedAt: submittedAt
		};
		return { run, runInput };
	}

	/**
	 * Refuses a run its owner asked for while the runs that execute now are at a limit (ADR 0053).
	 * The admission lock is held until the caller's transaction ends, so the run it saves is
	 * counted by the next admission.
	 */
	private async admitRequested(requestId: string): Promise<void> {
		const admission = this.dependencies.runAdmission.admit(
			await this.dependencies.records.lockExecutingCounts()
		);
		if (admission.kind === 'admitted') return;
		// The run that took the last place may be this request's own earlier send, still in flight
		// when the client sent it again. The answer to that request is the run it started.
		if (await this.dependencies.records.findByRequestId(requestId)) throw new DuplicateSubmission();
		throw new ConflictError(this.dependencies.runAdmission.refusal(admission, 'requested'));
	}

	/**
	 * Saves an admitted run, queued, with its prompt and first event, inside the caller's
	 * transaction. The caller starts execution after that transaction commits (ADR 0025).
	 */
	private saveQueued(staged: StagedRun): Promise<AgentRunReceipt> {
		return this.save(staged, {
			type: 'run_queued',
			runId: staged.run.id,
			attempt: 1,
			reason: 'submitted'
		});
	}

	/**
	 * Saves a run that was not admitted as failed, with its prompt and the reason, inside the
	 * caller's transaction. It never executes; its owner can retry it from the chat.
	 */
	private saveRefused(staged: StagedRun, failure: string): Promise<AgentRunReceipt> {
		const refusedAt = this.dependencies.now();
		return this.save(
			{
				...staged,
				run: {
					...staged.run,
					status: 'failed',
					failure,
					finishedAt: refusedAt,
					updatedAt: refusedAt
				}
			},
			{
				type: 'failed',
				runId: staged.run.id,
				code: 'NOT_ADMITTED',
				message: failure,
				retryable: false
			}
		);
	}

	private async save({ run, runInput }: StagedRun, first: AgentEvent): Promise<AgentRunReceipt> {
		const inserted = await this.dependencies.records.insertIdempotent(run);
		if (!inserted) throw new DuplicateSubmission();
		await this.dependencies.conversationMessages.recordUserPrompt(
			run.conversationId,
			runInput.prompt,
			run.id,
			runInput.images
		);
		const event = await this.dependencies.records.append(run.id, 0, first);
		return {
			runId: run.id,
			conversationId: run.conversationId,
			status: run.status,
			latestCursor: event.cursor
		};
	}

	async getRun(runId: AgentRunId): Promise<AgentRunSnapshot> {
		const run = await this.dependencies.records.findById(runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return this.snapshot(run);
	}

	async observeRun(runId: AgentRunId, listener: () => void): Promise<() => Promise<void>> {
		await this.requireRun(runId);
		return this.dependencies.runSignals.observe(runId, listener);
	}

	async isRunStreamComplete(runId: AgentRunId, deliveredCursor: string): Promise<boolean> {
		const run = await this.requireRun(runId);
		const latestCursor = await this.dependencies.records.latestCursor(runId);
		return this.dependencies.runStatus.eventStreamComplete(
			run.status,
			deliveredCursor,
			latestCursor
		);
	}

	/**
	 * Preserve unreadable rows so consumers can report the loss and checkpoint
	 * their cursors, including when the final saved event is unreadable.
	 */
	async listRunEvents(
		runId: AgentRunId,
		after: string
	): Promise<readonly StoredAgentRunEventRecord[]> {
		const stored = await this.dependencies.records.replay(runId, after);
		const unreadable = stored.filter((record) => record.kind === 'unreadable');
		if (unreadable.length > 0)
			console.warn(
				`[agent] ${unreadable.length} stored run event(s) in the replay of ${runId} no longer match the event union: ${unreadable
					.map((record) => `${record.cursor}: ${record.reason}`)
					.join('; ')}`
			);
		return stored;
	}

	decide(input: DecideAgentRunInput): Promise<AgentRunSnapshot> {
		const { callId, ...rest } = input;
		return this.decideMany({ ...rest, callIds: [callId] });
	}

	async decideMany(input: DecideAgentRunBatchInput): Promise<AgentRunSnapshot> {
		const result = await this.dependencies.transactionRunner.run(async () => {
			const run = await this.dependencies.transitions.getForWrite(input.runId);
			const change = this.dependencies.transitions.planApproval(
				run,
				input.callIds,
				this.dependencies.now()
			);
			for (const callId of input.callIds)
				await this.dependencies.records.record({
					runId: input.runId,
					callId,
					decision: input.decision,
					...(input.message === undefined ? {} : { message: input.message })
				});
			const queued = change
				? await this.dependencies.transitions.persistApproval(run.id, change)
				: run;
			if (change)
				await this.dependencies.records.append(run.id, 0, {
					type: 'run_queued',
					runId: run.id,
					attempt: 1,
					reason: 'resumed'
				});
			return { snapshot: await this.snapshot(queued), requeued: change !== null };
		});
		if (result.requeued) this.executeInBackground(input.runId);
		return result.snapshot;
	}

	async cancel(runId: AgentRunId): Promise<AgentRunSnapshot> {
		const { run, executing } = await this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.transitions.getForWrite(runId);
			const change = this.dependencies.transitions.planCancellation(
				current.status,
				this.dependencies.now()
			);
			if (!change) return { run: current, executing: false };
			const requested = await this.dependencies.transitions.persistCancellation(runId, change);
			if (requested.status === 'cancelled') {
				await this.abandonPendingCalls(
					requested,
					'The request was cancelled before the tool call ran.'
				);
				await this.dependencies.records.append(requested.id, 0, {
					type: 'cancelled',
					runId: requested.id,
					message: 'The request was cancelled before it started'
				});
				return { run: await this.requireRun(runId), executing: false };
			}
			return { run: requested, executing: current.status === 'running' };
		});
		// A running execution, in this process or another, is notified when the `cancelling`
		// status commits; it aborts and settles the run itself.
		if (executing) {
			this.settleCancellationAfterGrace(runId);
			return this.snapshot(run);
		}
		// No execution to abort. A run parked on an approval would otherwise sit in
		// `cancelling` forever.
		if (run.status !== 'cancelling') return this.snapshot(run);
		const cancelled = await this.finishCancellation(runId);
		return this.snapshot(cancelled ?? run);
	}

	/**
	 * `cancelling` must be transient even when the execution never unwinds: a hung
	 * provider call, or a tool doing local work the signal cannot reach, would
	 * otherwise park the row forever. The executor settling first makes this a
	 * no-op compare-and-set, so the cancelled event is still appended exactly once.
	 */
	private settleCancellationAfterGrace(runId: AgentRunId): void {
		const timer = setTimeout(() => {
			// chisel-ignore fail-loudly:silent-catch -- this detached grace timer has no request caller; failure is emitted as an operational error for repair.
			this.finishCancellation(runId).catch((error) =>
				console.error(`[agent-run] Could not settle cancelled run ${runId}:`, error)
			);
		}, CANCELLATION_GRACE_MS);
		timer.unref();
	}

	async retry(runId: AgentRunId, requestId: string): Promise<AgentRunReceipt> {
		const duplicate = await this.dependencies.records.findByRequestId(requestId);
		if (duplicate) return this.receipt(duplicate);
		try {
			const receipt = await this.dependencies.transactionRunner.run(async () => {
				const original = await this.requireAgentRun(runId);
				if (
					!this.dependencies.runStatus.isTerminal(original.status) ||
					original.status === 'completed'
				)
					throw new ValidationError('Only failed or cancelled runs can be retried');
				// Locks are taken in one order, the conversation and then admission, as in submit. A
				// retry holding admission while its insert waits on a submit's conversation lock
				// would deadlock with that submit.
				await this.dependencies.conversationSessions.getForWrite(original.conversationId);
				await this.admitRequested(requestId);
				const submittedAt = this.dependencies.now();
				// Joins the retry request's trace, same as a fresh submit.
				const retryTraceparent = this.dependencies.traceContext.activeTraceparent();
				const retry: AgentRun = {
					kind: 'agent',
					id: crypto.randomUUID() as AgentRunId,
					userId: original.userId,
					conversationId: original.conversationId,
					model: original.model,
					executionMode: original.executionMode,
					status: 'queued',
					requestId,
					pendingDecisions: [],
					inputSnapshot: original.inputSnapshot,
					retryOfRunId: original.id,
					...(retryTraceparent ? { traceparent: retryTraceparent } : {}),
					definitionVersion: 2,
					createdAt: submittedAt,
					updatedAt: submittedAt
				};
				const inserted = await this.dependencies.records.insertIdempotent(retry);
				if (!inserted) throw new DuplicateSubmission();
				const event = await this.dependencies.records.append(retry.id, 0, {
					type: 'run_queued',
					runId: retry.id,
					attempt: 1,
					reason: 'submitted'
				});
				return {
					runId: retry.id,
					conversationId: retry.conversationId,
					status: retry.status,
					latestCursor: event.cursor
				};
			});
			this.executeInBackground(receipt.runId);
			return receipt;
		} catch (error) {
			if (!(error instanceof DuplicateSubmission)) this.raiseActiveRunConflict(error);
			const existing = await this.dependencies.records.findByRequestId(requestId);
			if (!existing) throw error;
			return this.receipt(existing);
		}
	}

	private executeInBackground(runId: AgentRunId): void {
		// chisel-ignore fail-loudly:silent-catch -- detached execution persists a failed run; only failure of that settlement reaches the terminal reporter.
		void this.executeCancellably(runId)
			.catch(async (error) => {
				// A detached run executes outside the instrumented boundary, so nothing else logs
				// its failure; the run's own record carries it for the user.
				console.error(`[agent-run] Run ${runId} failed:`, error);
				// Without this the run stays `running` forever, holding the
				// conversation's single active-run slot and its open event stream.
				await this.failRun(runId, error instanceof Error ? error : new Error(String(error)));
			})
			.catch((error) =>
				console.error(`[agent-run] Background execution could not be settled for ${runId}:`, error)
			);
	}

	private async executeCancellably(runId: AgentRunId): Promise<void> {
		const execution = new AbortController();
		const stopWatching = await this.dependencies.runSignals.abortOnCancel(runId, execution);
		try {
			await this.execute(runId, execution.signal);
		} finally {
			await stopWatching();
		}
	}

	/**
	 * Discard a user turn and everything after it, so an edited or re-asked
	 * question can be submitted as an ordinary run. Both halves of the record
	 * have to go: the transcript the client hydrates from, and the provider
	 * session the run replays.
	 */
	private async rewind(conversationId: ConversationId, ordinal: number): Promise<void> {
		const active = await this.dependencies.records.findActiveByConversation(conversationId);
		if (active) throw new ValidationError('Wait for the current agent run to finish first');
		await this.dependencies.conversationMessages.truncateFromUserMessage(conversationId, ordinal);
		const items = await this.dependencies.records.list(conversationId);
		const rewound = this.dependencies.conversationHistory.rewind(
			items.map((item) => item.item),
			ordinal
		);
		if (rewound) await this.dependencies.records.replace(conversationId, rewound);
	}

	private freezeInput(
		input: SubmitAgentRunInput,
		preferences: AgentPreferences
	): StagedAgentRunInput {
		this.dependencies.imagePreparation.validate(input);
		const contextProjectId =
			input.appContext?.currentProject?.id ?? input.appContext?.activeResource?.projectId;
		const contextNoteId =
			input.appContext?.workbench?.focusedNoteId ??
			(input.appContext?.activeResource?.kind === 'note'
				? (input.appContext.activeResource.id as NoteId)
				: undefined);
		const overriddenProjectId =
			input.projectId && contextProjectId && input.projectId !== contextProjectId
				? input.projectId
				: undefined;
		const overriddenNoteId =
			input.noteId && contextNoteId && input.noteId !== contextNoteId ? input.noteId : undefined;
		// A skill with `allowImplicitInvocation: false` is only advertised when it is
		// asked for, so the screens that exist for one ask on the user's behalf: a
		// studio canvas is open, so diagram guidance is what the run is for. Which
		// skill goes with which screen is declared by the skill, not decided here —
		// otherwise every such pairing is another literal-against-literal branch.
		const requestedSkillNames = [
			...new Set([
				...(input.requestedSkillNames ?? []),
				...(input.appContext?.surface
					? this.dependencies.builtInSkills.forSurface(input.appContext.surface.kind)
					: [])
			])
		];
		// Freeze effective settings so later deployment changes cannot alter a resumed turn.
		const webSearch = this.dependencies.runSettings.research(
			{
				...(preferences.webSearchEngine ? { engine: preferences.webSearchEngine } : {}),
				...(preferences.webSearchMaxResults ? { maxResults: preferences.webSearchMaxResults } : {}),
				...(preferences.webSearchMaxTotalResults
					? { maxTotalResults: preferences.webSearchMaxTotalResults }
					: {})
			},
			this.dependencies.runSettings.research(
				this.dependencies.webSearchOverrides,
				CHAT_WEB_SEARCH_DEFAULTS
			)
		);
		return {
			requestId: input.requestId,
			prompt: input.input,
			...(input.images?.length ? { images: input.images } : {}),
			...(input.contextImages?.length ? { contextImages: input.contextImages } : {}),
			...(input.conversationId ? { conversationId: input.conversationId } : {}),
			...((contextProjectId ?? input.projectId)
				? { projectId: contextProjectId ?? input.projectId }
				: {}),
			...((contextNoteId ?? input.noteId) ? { noteId: contextNoteId ?? input.noteId } : {}),
			...(input.selection ? { selection: input.selection } : {}),
			...(input.selections?.length ? { selections: input.selections } : {}),
			...(input.contextNoteIds ? { contextNoteIds: input.contextNoteIds } : {}),
			...(input.contextResources?.length ? { contextResources: input.contextResources } : {}),
			...(requestedSkillNames.length ? { requestedSkillNames } : {}),
			...(input.requestedSkillNoteIds
				? { requestedSkillNoteIds: input.requestedSkillNoteIds }
				: {}),
			...(input.appContext ? { appContext: structuredClone(input.appContext) } : {}),
			...(overriddenProjectId || overriddenNoteId
				? {
						requestedScope: {
							...(overriddenProjectId ? { projectId: overriddenProjectId } : {}),
							...(overriddenNoteId ? { noteId: overriddenNoteId } : {})
						}
					}
				: {}),
			...(input.model !== undefined ? { modelOverride: input.model } : {}),
			...(input.visionModel !== undefined ? { visionModelOverride: input.visionModel } : {}),
			...(input.mode !== undefined ? { executionModeOverride: input.mode } : {}),
			...(preferences.agentMaxTurns ? { maxTurns: preferences.agentMaxTurns } : {}),
			webSearch
		};
	}

	/**
	 * Decide which model reads this run's images.
	 *
	 * When the chat model has native vision it reads them itself and no
	 * describer is set — a vision model left selected in the composer is not a
	 * request to caption, since that picker stays populated while disabled and a
	 * stale selection would downgrade a model that can see the image to a
	 * second-hand description of it.
	 *
	 * Otherwise the user's default (or the deployment's) is attached, which is
	 * what stops images from being silently dropped by a model that cannot read
	 * them. Catalogue failures propagate; trusted deployment roles fill only
	 * catalogue omissions and do not overwrite known provider capabilities.
	 */
	private async withImageReader(
		runInput: RunAgentInput,
		chatModel: string,
		conversation: Conversation,
		preferences: AgentPreferences
	): Promise<RunAgentInput> {
		// Context images need a model that can see just as much as attachments do;
		// ignoring them here would silently drop the render on a text-only model.
		if (this.dependencies.imagePreparation.prepare(runInput).kind === 'none') return runInput;
		const models = await this.selectableModels();
		return this.dependencies.imagePreparation.freezeReader(
			runInput,
			models,
			chatModel,
			this.dependencies.modelSelection.resolveVisionModel(
				conversation,
				preferences,
				this.dependencies.defaultVisionModel
			)
		);
	}

	private async requireRun(runId: AgentRunId): Promise<AgentRun> {
		const run = await this.dependencies.records.findById(runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	private async requireAgentRun(runId: AgentRunId): Promise<ResolvedAgentRun> {
		const run = await this.dependencies.records.findAgentById(runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	private async receipt(run: AgentRun): Promise<AgentRunReceipt> {
		return {
			runId: run.id,
			conversationId: run.conversationId,
			status: run.status,
			latestCursor: await this.dependencies.records.latestCursor(run.id)
		};
	}

	private async snapshot(run: AgentRun): Promise<AgentRunSnapshot> {
		return {
			run,
			latestCursor: await this.dependencies.records.latestCursor(run.id),
			pendingDecisions: run.pendingDecisions
		};
	}

	/**
	 * Raises, always. It used to answer `unknown` so both call sites could
	 * `throw` its result, which put an `unknown` on a controller's surface to
	 * describe a value nobody ever holds: every path out of here is a throw.
	 */
	// chisel-ignore narrowing:no-unknown-type -- TypeScript types a caught error as unknown; this is one.
	private raiseActiveRunConflict(error: unknown): never {
		if (
			typeof error === 'object' &&
			error !== null &&
			'constraint_name' in error &&
			error.constraint_name === 'agent_runs_active_conversation_unique'
		)
			throw new ValidationError('This conversation already has an active agent run');
		throw error;
	}

	async execute(runId: AgentRunId, signal: AbortSignal): Promise<AgentRunExecutionOutcome> {
		try {
			const run = await this.prepare(runId);
			if (!run) return 'cancelled';
			const request = run.inputSnapshot;
			const decisions = await this.dependencies.records.loadUnconsumed(run.id);
			const completed = async (call: AgentToolCompletion, _output: AgentPayload) => {
				if (call.classification !== 'mutation') return;
				await this.persistEvent(run, { type: 'resources_stale', resources: ['workspace'] });
			};
			for await (const update of this.turnUpdates({
				run,
				request,
				imageInput: this.dependencies.imagePreparation.prepare(request),
				webSearch: this.dependencies.runSettings.research(
					request.webSearch ?? {},
					this.dependencies.runSettings.research(
						this.dependencies.webSearchOverrides,
						CHAT_WEB_SEARCH_DEFAULTS
					)
				),
				context: run.contextSnapshot,
				...(decisions.length > 0 ? { decisions } : {}),
				signal,
				completed
			})) {
				// A runner that swallows the abort and keeps yielding still settles
				// here, at the next boundary, instead of wedging in `cancelling`.
				if (signal.aborted) {
					await this.finishCancellation(run.id);
					return 'cancelled';
				}
				if (update.type === 'event') {
					await this.persistEvent(run, update.event);
					continue;
				}
				if (update.type === 'approval_checkpoint') {
					let parked: AgentRun | undefined;
					await this.dependencies.transactionRunner.run(async () => {
						const change = this.dependencies.transitions.prepareCheckpoint(
							run,
							update,
							this.dependencies.now()
						);
						parked = await this.dependencies.transitions.persistCheckpoint(run.id, change);
						if (!parked) return;
						await this.dependencies.records.replace(run.conversationId, update.sessionItems);
						for (const decision of decisions)
							await this.dependencies.records.consume(
								run.id,
								decision.callId,
								new Date(this.dependencies.now())
							);
						for (const pending of update.pendingDecisions) {
							const event: AgentEvent =
								pending.source === 'catalog'
									? {
											type: 'approval_required',
											runId: run.id,
											callId: pending.callId,
											source: 'catalog',
											name: pending.toolName,
											arguments: pending.arguments,
											...(pending.review ? { review: pending.review } : {})
										}
									: {
											type: 'approval_required',
											runId: run.id,
											callId: pending.callId,
											source: 'connector',
											name: pending.toolName,
											connector: pending.connector,
											arguments: pending.arguments
										};
							const record = await this.dependencies.records.append(run.id, 1, event);
							const activity = this.dependencies.toolActivity.activity(event);
							if (activity)
								await this.dependencies.conversationMessages.recordToolActivity(
									run.conversationId,
									activity,
									{ runId: run.id, eventCursor: record.cursor }
								);
						}
					});
					// The park lost the race with a cancellation: the row is `cancelling`,
					// so settle it rather than report a park that never happened.
					if (!parked) {
						await this.finishCancellation(run.id);
						return 'cancelled';
					}
					return 'awaiting_approval';
				}
				const settled = await this.complete(
					run,
					update.sessionItems,
					decisions.map((decision) => decision.callId)
				);
				// Same race as the park above: completion arrived after the row was
				// already `cancelling`, so the cancel wins.
				if (!settled) {
					await this.finishCancellation(run.id);
					return 'cancelled';
				}
				return 'completed';
			}
			throw new Error('The agent provider ended without a durable outcome');
		} catch (error) {
			// Cancellation can win while context is being built, before an abort arrives.
			// The locked preparation read distinguishes it from a real preparation failure.
			const settled = await this.finishCancellation(runId);
			if (signal.aborted || settled || error instanceof RunPreparationCancelled) return 'cancelled';
			throw error;
		}
	}

	async openMcpTools(scope: McpScope, provenanceId: ProvenanceId): Promise<McpToolSession> {
		const tools = this.dependencies.mcpTools({ provenanceId });
		const disabled = await this.disabledTools();
		const permitted = this.permittedTools(tools, disabled, scope === 'read' ? ['read'] : undefined);
		const plan = this.toolPlan(permitted, []);
		return {
			tools,
			plan,
			discover: async (query, limit) => {
				const ranked = await this.dependencies.toolSearch.rank(
					permitted
						.map((tool) => tool.name)
						.filter((name) => !this.dependencies.toolCatalog.isFirstClass(name)),
					query,
					limit
				);
				return ranked.flatMap((name) => permitted.find((tool) => tool.name === name)?.name ?? []);
			},
			failed: (value) =>
				this.dependencies.turns.toolOutcome({ kind: 'value', value }).kind !== 'succeeded'
		};
	}

	/** One model turn of a run: its events as they stream, then a checkpoint or completion. */
	private async *turnUpdates(input: {
		readonly run: ResolvedAgentRun;
		readonly request: RunAgentInput;
		readonly imageInput: AgentRunImages;
		readonly webSearch: WebResearchSettings;
		readonly context: AgentRunContext;
		readonly decisions?: readonly AgentRunDecisionRecord[];
		readonly signal: AbortSignal;
		readonly completed: AgentToolPolicy['completed'];
	}): AsyncIterable<AgentExecutionUpdate> {
		const { run, request, imageInput, webSearch, context, decisions = [], signal } = input;
		signal.throwIfAborted();
		if (!this.dependencies.agentAvailable)
			throw new AgentProviderFailure(
				'Agent chat is disabled until OPENROUTER_API_KEY is configured',
				'CONFIGURATION',
				false
			);
		const preparation = new AbortController();
		const preparationSignal = AbortSignal.any([signal, preparation.signal]);
		let turn: AgentProviderTurn | undefined;
		try {
			const tools = this.dependencies.tools({
				provenanceId: run.provenanceId as ProvenanceId,
				input: request,
				model: run.model
			});
			const disabled = await this.disabledTools(request.projectId);
			signal.throwIfAborted();
			const history = await this.dependencies.conversationHistory.load(run.conversationId);
			// The app's own images are described too when the chat model cannot see: a
			// render left out here would simply vanish on a text-only model.
			const visionDescriptions =
				imageInput.kind === 'describe'
					? await this.dependencies.turns.describeImages(
							imageInput.images,
							imageInput.model,
							preparationSignal
						)
					: [];
			const permitted = this.permittedTools(tools, disabled);
			const catalog = this.discoveryCatalog(disabled);
			const connectorBuilds = await this.connectorBuilds(run);
			signal.throwIfAborted();
			const connectorTools = this.dependencies.connectorTools(connectorBuilds.builds);
			const connectorNames = connectorTools.map((tool) => tool.name);
			// Connector tools are always the long tail: found through search_tools (ADR 0022).
			const discoverable = [...catalog, ...connectorNames];
			const promoted = this.dependencies.toolRecovery.promoted(
				this.dependencies.turns.calledTools(history),
				run.pendingDecisions.map((decision) => decision.toolName),
				discoverable
			);
			// `promoted` re-enables tools an earlier turn of the conversation discovered. Without
			// it the model's own transcript shows it calling a tool the run no longer offers, so it
			// repeats the call and gets `Tool not found`.
			const discovered = new Set<string>(promoted);
			const plan = this.toolPlan(permitted, this.approvalRequired(run.executionMode));
			const toolset = this.dependencies.toolset(tools, connectorTools, {
				plan,
				isDiscovered: (name) => discovered.has(name),
				discover: async (query, limit) => {
					const found = await this.rankTools(permitted, catalog, connectorNames, query, limit);
					for (const name of found) discovered.add(name);
					return found;
				},
				completed: input.completed,
				parked: run.pendingDecisions,
				spill: (callId, output) =>
					this.dependencies.conversationHistory.spill(run.conversationId, callId, output),
				signal
			});
			// Only the tools the model can actually see this generation: the long tail is
			// registered but gated, so naming it here would report an undiscovered tool as callable.
			const offered = [
				...permitted
					.map((tool) => tool.name)
					.filter(
						(name) => this.dependencies.toolCatalog.isFirstClass(name) || promoted.includes(name)
					),
				...connectorNames.filter((name) => promoted.includes(name))
			];
			const recovery = this.dependencies.toolRecovery.configuration(offered, discoverable);
			let outputText = '';
			// Captured by the turn observer before the first update is yielded, so the
			// checkpoint below can hand the next resume the trace this run belongs to.
			let traceparent = run.traceparent;
			const { skills: instructionSkills, ...instructionContext } = context;
			const instructions = this.dependencies.prompts.instructions(
				request.schedule
					? {
							...instructionContext,
							schedule: {
								...request.schedule,
								skillNoteIds: request.requestedSkillNoteIds ?? []
							}
						}
					: instructionContext,
				instructionSkills,
				undefined,
				connectorBuilds.services
			);
			const prompt = this.dependencies.prompts.message(
				context,
				request.prompt ?? '',
				imageInput,
				visionDescriptions
			);
			const dependencies = this.dependencies;
			const started = await dependencies.turns.turn({
				model: run.model,
				instructions,
				webSearch,
				tools: toolset.tools,
				conversationId: run.conversationId,
				history,
				prompt,
				maxTurns: request.maxTurns ?? DEFAULT_AGENT_MAX_TURNS,
				signal,
				recovery,
				decisions,
				serializedState: run.serializedState
			});
			turn = started;
			const runTurn = async function* (): AsyncGenerator<AgentExecutionUpdate> {
				const activeCalls = new Map<string, ProviderToolCall>();
				let streamed = false;
				for await (const event of started.events) {
					if (event.type === 'tool_called') {
						const call = dependencies.streamPresentation.start(event.call);
						activeCalls.set(call.callId, call);
						const started = dependencies.streamPresentation.started(
							call,
							toolset.subject(call.name)
						);
						if (started) yield { type: 'event', event: started };
					}
					if (event.type === 'tool_output') {
						const resolved = dependencies.streamPresentation.completed(event.call, activeCalls);
						if (resolved.callId !== undefined) activeCalls.delete(resolved.callId);
						yield {
							type: 'event',
							event: dependencies.streamPresentation.settled(
								resolved,
								toolset.subject(resolved.name),
								dependencies.turns.toolOutcome(event.call.output)
							)
						};
					}
					const reasoning = dependencies.streamPresentation.reasoning(event, streamed);
					streamed = reasoning.streamed;
					if (reasoning.event) yield { type: 'event', event: reasoning.event };
					if (event.type === 'text_delta') {
						outputText += event.text;
						yield { type: 'event', event: { type: 'text_delta', text: event.text } };
					}
				}
				const outcome = await started.outcome();
				const sessionItems = await dependencies.conversationHistory.snapshot(
					run.conversationId,
					outcome.sessionItems
				);
				if (outcome.kind === 'approval') {
					yield {
						type: 'approval_checkpoint',
						serializedState: outcome.serialize(),
						...(traceparent ? { traceparent } : {}),
						pendingDecisions: outcome.pending.map((pending) => toolset.checkpoint(pending)),
						sessionItems
					};
					return;
				}
				yield { type: 'completed', sessionItems };
			};
			yield* this.dependencies.observeTurn(
				{
					input: request.prompt ?? '',
					sessionId: run.conversationId,
					model: run.model,
					userId: this.actor.userId,
					runId: run.id,
					...(run.traceparent ? { parentTraceparent: run.traceparent } : {}),
					onRoot: (value: string) => {
						traceparent ??= value;
					}
				},
				runTurn,
				() => outputText
			);
		} catch (error) {
			if (signal.aborted) throw error;
			throw this.dependencies.turns.failure(error);
		} finally {
			preparation.abort();
			await turn?.close();
		}
	}

	/** The tools a user has switched off, for the whole workspace or for one project. */
	private async disabledTools(projectId?: ProjectId): Promise<ReadonlySet<string>> {
		const preferences = await this.dependencies.toolPreferences.view(
			this.dependencies.toolCatalog.entries(),
			projectId
		);
		return new Set(preferences.filter((preference) => !preference.enabled).map((p) => p.name));
	}

	/**
	 * The one place the user's tool selection applies, so a switched-off tool disappears from
	 * the in-app agent, from `search_tools`, from direct dispatch and from MCP at once.
	 */
	private permittedTools(
		tools: readonly AgentTool[],
		disabled: ReadonlySet<string>,
		classifications?: readonly AgentTool['classification'][]
	): readonly AgentTool[] {
		return tools.filter(
			(tool) =>
				(!classifications || classifications.includes(tool.classification)) &&
				(this.dependencies.toolCatalog.isLocked(tool.name) || !disabled.has(tool.name))
		);
	}

	private toolPlan(
		permitted: readonly AgentTool[],
		approvalRequired: readonly ToolName[]
	): AgentToolPlan {
		const names = permitted.map((tool) => tool.name);
		return {
			initial: FIRST_CLASS_TOOL_NAMES.filter((name) => names.includes(name)),
			discoverable: names.filter((name) => !this.dependencies.toolCatalog.isFirstClass(name)),
			approvalRequired
		};
	}

	private approvalRequired(mode: AgentExecutionMode): readonly ToolName[] {
		return this.dependencies.toolCatalog
			.entries()
			.filter(
				(entry) =>
					this.dependencies.toolApproval.requirement(entry.classification, mode) ===
					'approval_required'
			)
			.map((entry) => entry.name);
	}

	/** The long-tail tools `search_tools` ranks for an in-app run. */
	private discoveryCatalog(disabled: ReadonlySet<string>): readonly string[] {
		return this.dependencies.toolCatalog
			.discoverable()
			.filter(
				(entry) => this.dependencies.toolCatalog.isLocked(entry.name) || !disabled.has(entry.name)
			)
			.map((entry) => entry.name);
	}

	/**
	 * One query vector ranks catalog and connector tools on one scale, so a
	 * connector tool competes for the same `limit` places as a catalog tool.
	 */
	private async rankTools(
		permitted: readonly { readonly name: ToolName }[],
		catalog: readonly string[],
		connectorNames: readonly ConnectorToolName[],
		query: string,
		limit: number
	): Promise<readonly RunToolName[]> {
		const candidates = catalog.filter((name) => !this.dependencies.toolCatalog.isFirstClass(name));
		if (!candidates.length && !connectorNames.length) return [];
		const connectors = this.dependencies.connectors;
		if (!connectorNames.length || connectors.kind === 'off') {
			const ranked = await this.dependencies.toolSearch.rank(candidates, query, limit);
			return ranked.flatMap((name) => permitted.find((tool) => tool.name === name)?.name ?? []);
		}
		const vector = await this.dependencies.toolSearch.queryVector(query);
		const [catalogDistances, connectorDistances] = await Promise.all([
			this.dependencies.toolSearch.distances(candidates, vector),
			connectors.source.distances(connectorNames, vector)
		]);
		const names = new Map<string, RunToolName>([
			...permitted.map((tool) => [tool.name, tool.name] as const),
			...connectorNames.map((name) => [name, name] as const)
		]);
		return [...catalogDistances, ...connectorDistances]
			.sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name))
			.flatMap((entry) => names.get(entry.name) ?? [])
			.slice(0, limit);
	}

	/**
	 * The connector tools this run offers. A tool turned off or with an unusable
	 * schema is not built. A parked call whose tool is gone, changed checksum or
	 * was turned off gets a withdrawn tool of its name, so the saved run still
	 * resumes and the call runs nothing (ADR 0049).
	 */
	private async connectorBuilds(run: ResolvedAgentRun): Promise<{
		readonly builds: readonly ConnectorToolBuild[];
		readonly services: readonly string[];
	}> {
		const connectors = this.dependencies.connectors;
		if (connectors.kind === 'off') return { builds: [], services: [] };
		const entries = await connectors.source.runTools();
		const available = entries.flatMap((entry): ConnectorToolBuild[] => {
			const { tool } = entry;
			const choice = connectors.policy.effective(tool.policy, tool.hints);
			if (choice === 'off' || tool.schema.kind !== 'usable') return [];
			return [
				{
					kind: 'available',
					tool,
					connector: entry.connector,
					inputSchema: tool.schema.inputSchema,
					approval: this.dependencies.toolApproval.connectorRequirement(choice, run.executionMode)
				}
			];
		});
		const byName = new Map(
			available.flatMap((build) =>
				build.kind === 'available' ? [[build.tool.modelName, build]] : []
			)
		);
		const withdrawn = run.pendingDecisions.flatMap((decision): ConnectorToolBuild[] => {
			if (decision.source !== 'connector') return [];
			const current = byName.get(decision.toolName);
			if (current?.kind === 'available' && current.tool.checksum === decision.checksum) return [];
			byName.delete(decision.toolName);
			return [
				{
					kind: 'withdrawn',
					name: decision.toolName,
					connector: decision.connector,
					checksum: decision.checksum,
					reason: current
						? 'This tool changed after you approved the call, so nothing ran.'
						: 'This tool is no longer available on its connector, so nothing ran.'
				}
			];
		});
		return {
			builds: [...byName.values(), ...withdrawn],
			services: [...new Set(entries.map((entry) => entry.connector.title))]
		};
	}

	/**
	 * Settles a run the user asked to stop. `cancelling` is the only legal
	 * predecessor of `cancelled`, and the caller commits that write before
	 * aborting, so by the time this runs the row is already parked there.
	 * Returns undefined when the run settled on its own first.
	 */
	async finishCancellation(runId: AgentRunId): Promise<AgentRun | undefined> {
		const result = await this.dependencies.transactionRunner.run(async () => {
			const settlement = await this.dependencies.settlements.claim(runId, {
				kind: 'cancelled',
				message: 'Generation stopped'
			});
			if (settlement.kind === 'lost') return settlement;
			const run = settlement.run;

			await this.abandonPendingCalls(run, 'The request was cancelled before you answered.');

			return this.dependencies.settlements.complete(settlement);
		});
		if (result.kind === 'lost') return undefined;
		return result.run;
	}

	/**
	 * Settles a run whose background execution threw. Without this a crashed run
	 * stays `running` forever, holding the conversation's single active-run slot
	 * and keeping its event stream open.
	 */
	async failRun(runId: AgentRunId, error: Error): Promise<void> {
		try {
			const code = error instanceof AgentProviderFailure ? error.providerCode : 'INTERNAL';
			const message = error.message;
			const failed = await this.dependencies.transactionRunner.run(async () => {
				const settlement = await this.dependencies.settlements.claim(runId, {
					kind: 'failed',
					code,
					message,
					retryable: false
				});
				if (settlement.kind === 'lost') return settlement;
				const run = settlement.run;

				await this.abandonPendingCalls(run, 'The run ended before you answered this.');

				return this.dependencies.settlements.complete(settlement);
			});
			if (failed.kind === 'settled') return;

			// Not `running`: either the user asked to stop and the run is parked in
			// `cancelling`, or it already settled. Both are handled by the no-op
			// compare-and-set below.
			await this.finishCancellation(runId);
		} catch (settlementError) {
			throw new AggregateError(
				[error, settlementError],
				`Agent run ${runId} failed and its failure could not be persisted`,
				{ cause: settlementError }
			);
		}
	}

	private async prepare(runId: AgentRunId): Promise<PreparedAgentRun | undefined> {
		const transitioned = await this.dependencies.transitions.claim(runId, this.dependencies.now());
		if (!transitioned) return undefined;
		let run = transitioned;

		if (!run.provenanceId) {
			const provenance = await this.dependencies.provenance.record({
				producerKind: 'agent',
				producerName: 'FollowThrough Workbench Agent',
				pipeline: 'agent',
				runId: run.id,
				model: run.model,
				metadata: {}
			});
			run = await this.dependencies.transactionRunner.run(async () => {
				const current = await this.dependencies.transitions.getForPreparation(runId);
				const change = this.dependencies.transitions.provenance(
					current,
					provenance.id,
					this.dependencies.now()
				);
				return this.dependencies.transitions.persistProvenance(runId, change);
			});
		}

		// Once, before the first turn: a run that resumes after an approval has its context.
		if (!run.contextSnapshot && run.inputSnapshot.schedule)
			await this.requireScheduleStart(run.inputSnapshot);
		const context = run.contextSnapshot ?? (await this.buildContext(run.inputSnapshot));
		const prepared = await this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.transitions.getForPreparation(runId);
			const change = this.dependencies.transitions.context(
				current,
				context,
				this.dependencies.now()
			);
			const saved = await this.dependencies.transitions.persistContext(runId, change);
			await this.dependencies.records.append(runId, 1, { type: 'run_started', runId, attempt: 1 });
			return saved;
		});
		return prepared;
	}

	/**
	 * Refuses to start a scheduled run whose schedule names something that is gone. Running
	 * without it would look like a run that did what the schedule says, so the run fails and its
	 * owner reads which part to change. The claim has made the run `running`, which is the only
	 * state a run can fail from.
	 */
	private async requireScheduleStart(input: RunAgentInput): Promise<void> {
		const { modelOverride, projectId, requestedSkillNoteIds = [] } = input;
		if (
			modelOverride &&
			this.dependencies.modelChoices.modelChoiceIssue(
				await this.selectableModels(),
				modelOverride,
				'chat'
			)
		)
			throw new AgentProviderFailure(
				`This schedule's model, ${modelOverride}, is no longer offered. Choose another model on the schedule's page, then run it again.`,
				'MODEL_UNAVAILABLE',
				false
			);
		if (projectId) {
			try {
				await this.dependencies.contextProjects.get(projectId);
			} catch (error) {
				if (!(error instanceof NotFoundError)) throw error;
				throw new NotFoundError(
					"This schedule's project is archived or no longer exists. Choose another project on the schedule's page, then run it again.",
					{ projectId }
				);
			}
		}
		if (requestedSkillNoteIds.length === 0) return;
		const enabled = new Set(
			(await this.dependencies.contextSkills.listEnabled()).map((skill) => skill.noteId)
		);
		const noteId = requestedSkillNoteIds.find((requested) => !enabled.has(requested));
		if (noteId)
			throw new NotFoundError(
				"A skill this schedule uses is turned off or no longer exists. Remove it on the schedule's page, then run it again.",
				{ noteId }
			);
	}

	/** Every model a run can use: the provider's catalog, with the deployment's defaults in it. */
	private async selectableModels(): Promise<readonly AgentModel[]> {
		return this.dependencies.modelChoices.configuredAgentModels(
			await this.dependencies.models.list(),
			{
				chatModelId: this.dependencies.modelSelection.resolveDefaultAgentModel(
					{},
					this.dependencies.defaultModel
				),
				visionModelId: this.dependencies.modelSelection.resolveDefaultVisionModel(
					{},
					this.dependencies.defaultVisionModel
				)
			}
		);
	}

	private async buildContext(input: RunAgentInput): Promise<AgentRunContext> {
		await this.dependencies.transactionRunner.run(() => this.dependencies.builtInSkills.ensure());
		const current = input.noteId
			? {
					kind: 'note' as const,
					note: await this.dependencies.contextNotes.get(input.noteId)
				}
			: { kind: 'no_current_note' as const };
		const base = this.dependencies.contextFormatter.base(input, current);
		const [skills, contextNotes, contextResources, profileMemory] = await Promise.all([
			this.dependencies.contextSkills.listEnabled(base.projectId),
			Promise.all((input.contextNoteIds ?? []).map((noteId) => this.loadAttachedNote(noteId))),
			Promise.all((input.contextResources ?? []).map((ref) => this.loadAttachedResource(ref))),
			this.dependencies.contextMemory.list({})
		]);
		if (!input.appContext)
			return this.dependencies.contextFormatter.build(input, {
				base,
				skills,
				contextNotes,
				contextResources,
				profileMemory
			});
		const conversation = await this.dependencies.conversationSessions.get(input.conversationId);
		const origin = conversation.contextProjectId
			? {
					kind: 'project' as const,
					project: await this.dependencies.contextProjects.get(conversation.contextProjectId)
				}
			: { kind: 'no_origin_project' as const };
		const appContext = this.dependencies.contextFormatter.appContext(
			input.appContext,
			conversation,
			origin
		);
		if (!input.requestedScope)
			return this.dependencies.contextFormatter.build(input, {
				base,
				skills,
				contextNotes,
				contextResources,
				profileMemory,
				appContext
			});
		const requested = input.requestedScope;
		const [project, note] = await Promise.all([
			requested.projectId ? this.dependencies.contextProjects.get(requested.projectId) : undefined,
			requested.noteId ? this.dependencies.contextNotes.get(requested.noteId) : undefined
		]);
		const requestedScope = this.dependencies.contextFormatter.requestedScope(input.appContext, {
			project,
			note
		});
		return this.dependencies.contextFormatter.build(input, {
			base,
			skills,
			contextNotes,
			contextResources,
			profileMemory,
			appContext: { ...appContext, requestedScope }
		});
	}

	private async loadAttachedNote(noteId: NoteId) {
		try {
			return await this.dependencies.contextNotes.get(noteId);
		} catch (error) {
			if (!(error instanceof NotFoundError)) throw error;
			throw new NotFoundError(
				'An attached note is no longer available. Remove it from context and retry.',
				{ noteId }
			);
		}
	}

	private async loadAttachedResource(ref: ContextResourceRef): Promise<AttachedResource> {
		try {
			switch (ref.kind) {
				case 'widget':
					return {
						kind: 'widget',
						widget: await this.dependencies.contextWidgets.get(ref.id)
					};
				case 'diagram': {
					const diagram = await this.dependencies.contextDiagrams.get(ref.id);
					return {
						kind: 'diagram',
						diagram,
						filePath: this.dependencies.contextFiles.diagramPath(diagram)
					};
				}
				case 'attachment': {
					const view = await this.dependencies.contextAttachments.get(ref.id);
					return {
						kind: 'attachment',
						view,
						filePath: this.dependencies.contextFiles.attachmentPath(
							view.attachment.projectId,
							view.attachment.id
						)
					};
				}
				case 'connections':
					return await this.loadAttachedConnections(ref.id);
			}
		} catch (error) {
			if (!(error instanceof NotFoundError)) throw error;
			const retry = 'is no longer available. Remove it from context and retry.';
			switch (ref.kind) {
				case 'widget':
					throw new NotFoundError(`An attached widget ${retry}`, { widgetId: ref.id });
				case 'diagram':
					throw new NotFoundError(`An attached diagram ${retry}`, { diagramId: ref.id });
				case 'attachment':
					throw new NotFoundError(`An attached file ${retry}`, { attachmentId: ref.id });
				case 'connections':
					throw new NotFoundError(`An attached connection map ${retry}`, { projectId: ref.id });
			}
		}
	}

	/** The project's own reads go first: they refuse a project the actor does not own. */
	private async loadAttachedConnections(projectId: ProjectId): Promise<AttachedResource> {
		const [project, notes] = await Promise.all([
			this.dependencies.contextProjects.get(projectId),
			this.dependencies.contextProjectTree.readEntries(projectId)
		]);
		const [attachments, memory] = await Promise.all([
			this.dependencies.contextProjectAttachments.listForProject(projectId),
			this.dependencies.contextMemory.list({ projectId })
		]);
		const connections = await this.dependencies.contextConnections.connect(projectId, {
			notes,
			attachments,
			memory
		});
		return {
			kind: 'connections',
			project,
			tables: this.dependencies.connectionTables.tables(connections)
		};
	}

	/**
	 * Settles the calls a run was parked on when the run itself ends without them being
	 * answered. The journal is append-only, so a call's last written row is its status
	 * forever: a run that died holding an approval left that row saying `approval_required`
	 * and nothing ever contradicted it. Reopening the conversation then replayed a live
	 * Approve/Reject card for a run that could not act on either answer.
	 *
	 * The actor comes off the run row rather than the caller, because the two paths into
	 * here — a crash and a cancellation — both start from a run id alone.
	 */
	private async abandonPendingCalls(run: AgentRun, failure: string): Promise<void> {
		if (run.pendingDecisions.length === 0) return;
		for (const pending of run.pendingDecisions)
			await this.dependencies.conversationMessages.recordToolActivity(
				run.conversationId,
				{
					callId: pending.callId,
					name: pending.toolName,
					input: pending.arguments,
					failure,
					status: 'failed'
				},
				{ runId: run.id }
			);
		await this.dependencies.records.clearPending(run.id);
	}

	private async persistEvent(run: AgentRun, event: AgentEvent): Promise<AgentRunEventRecord> {
		const record = await this.dependencies.transactionRunner.run(async () => {
			const record = await this.dependencies.records.append(run.id, 1, event);
			const activity = this.dependencies.toolActivity.activity(event);
			if (activity)
				await this.dependencies.conversationMessages.recordToolActivity(
					run.conversationId,
					activity,
					{
						runId: run.id,
						eventCursor: record.cursor
					}
				);
			return record;
		});
		return record;
	}

	private async complete(
		run: AgentRun,
		sessionItems: readonly PersistedSessionItem[],
		decisionCallIds: readonly string[] = []
	): Promise<boolean> {
		const settled = await this.dependencies.transactionRunner.run(async () => {
			const settlement = await this.dependencies.settlements.claim(run.id, {
				kind: 'completed',
				conversationId: run.conversationId,
				model: run.model
			});
			if (settlement.kind === 'lost') return settlement;

			await this.dependencies.records.replace(run.conversationId, sessionItems);
			for (const callId of decisionCallIds)
				await this.dependencies.records.consume(run.id, callId, new Date(this.dependencies.now()));
			// One message per contiguous run of output, each carrying the cursor it began at.
			// Written as a single blob it could only be replayed after every tool call, which
			// is why a reopened conversation read as "all the work, then all the words".
			const records = await this.dependencies.records.listAttempt(run.id, 1);
			const segments = this.dependencies.streamPresentation.segments(records);
			for (const segment of segments) {
				const provenance = { runId: run.id, eventCursor: segment.cursor };
				if (segment.kind === 'reasoning')
					await this.dependencies.conversationMessages.recordAssistantReasoning(
						run.conversationId,
						segment.text,
						run.model,
						provenance
					);
				else
					await this.dependencies.conversationMessages.recordAssistantText(
						run.conversationId,
						segment.text,
						run.model,
						provenance
					);
			}

			return this.dependencies.settlements.complete(settlement);
		});
		return settled.kind === 'settled';
	}

	async recoverInterrupted(runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.records.findById(runId);
		if (!run || (run.status !== 'running' && run.status !== 'cancelling')) return;
		if (run.kind === 'agent') {
			if (run.status === 'cancelling') await this.finishCancellation(run.id);
			else await this.failRun(run.id, new Error('Process restarted'));
			return;
		}
		await this.dependencies.transactionRunner.run(async () => {
			const settlement = await this.dependencies.settlements.claim(
				run.id,
				run.status === 'cancelling'
					? { kind: 'cancelled', message: 'Generation stopped' }
					: {
							kind: 'failed',
							code: 'PROCESS_RESTARTED',
							message: 'Process restarted',
							retryable: true
						}
			);
			if (settlement.kind === 'lost') return settlement;

			return this.dependencies.settlements.complete(settlement);
		});
	}

	async resumeQueued(runId: AgentRunId): Promise<void> {
		this.executeInBackground(runId);
	}
}
