import { mutationResource } from '$lib/services/workspace/commands';
import type {
	ConversationMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import type { ActorContext } from '$lib/models/identity';
import type {
	AgentEvent,
	AgentPreferences,
	AgentRun,
	AgentRunId,
	AgentRunReceipt,
	AgentRunEventRecord,
	AgentRunSnapshot,
	PersistedSessionItem,
	Conversation,
	ConversationId,
	DecideAgentRunBatchInput,
	DecideAgentRunInput,
	RunAgentInput,
	ResolvedAgentRun,
	StagedAgentRunInput,
	StoredAgentRunEventRecord,
	SubmitAgentRunInput
} from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import { allImages, isTerminalAgentRunStatus } from '$lib/models/agent';
import { skillsForSurface } from '$lib/server/services/skills/built-in-definitions';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	AgentModelCatalog,
	AgentPreferencesStore
} from '$lib/server/services/agent/runs/preferences';
import type { ConversationJournal } from '$lib/server/services/agent/runs/contracts';
import {
	resolveAgentExecutionMode,
	resolveAgentModel,
	resolveVisionModel
} from '$lib/server/services/agent/runs/preferences';
import {
	abortActiveRun,
	registerActiveRun,
	releaseActiveRun
} from '$lib/server/services/agent/runs/active-runs';
import { rewindToUserItem } from '$lib/server/services/agent/conversations/rewind';
import { activeTraceparent } from '$lib/server/services/telemetry';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import { AgentProviderFailure } from '$lib/errors';
import type { AgentContext } from '$lib/server/services/agent/runs/context';
import type { NoteReader } from '$lib/server/services/notes/contracts';
import type { BuiltInSkillProvisioner, SkillFinder } from '$lib/server/services/skills/contracts';
import type { MemoryLibrary } from '$lib/server/services/memory/library';
import type { ProjectReader } from '$lib/server/services/projects/contracts';
import type { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { toolActivityFromEvent } from '$lib/models/agent';
import type { AgentRunContext, PreparedAgentRun } from '$lib/models/agent';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository,
	AgentSessionRepository
} from '$lib/server/services/agent/runs/execution-contracts';
import type { AgentRunExecutionOutcome } from '$lib/models/agent';
import type { AgentRunner, AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { AgentEventBus } from '$lib/server/services/agent/runs/events';
const now = (): DateTime => new Date().toISOString() as DateTime;

/** Grace period the executor gets to settle a cancelled run before the backstop does it. */
const CANCELLATION_GRACE_MS = 10_000;

class DuplicateSubmission extends Error {}

/**
 * Application boundary for the agent: submitting runs, streaming their events, and
 * managing the conversations (chats) they happen in. Controllers know nothing about
 * transports; this one deals in run receipts, snapshots, and event cursors.
 */
export interface AgentController {
	execute(runId: AgentRunId, signal: AbortSignal): Promise<AgentRunExecutionOutcome>;
	finishCancellation(runId: AgentRunId): Promise<AgentRun | undefined>;
	failRun(runId: AgentRunId, error: Error): Promise<void>;
	recoverInterruptedRuns(): Promise<number>;
	synchronize(
		actor: ActorContext,
		input: ConversationMutationRequest
	): Promise<WorkspaceMutationResult>;
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
	submit(actor: ActorContext, input: SubmitAgentRunInput): Promise<AgentRunReceipt>;
	/**
	 * Fetch a single run as a snapshot (the run plus its latest event cursor and pending
	 * decisions) so a client can resume the event stream and render approval cards.
	 *
	 * @throws NotFoundError if no run exists for `runId`.
	 */
	getRun(actor: ActorContext, runId: AgentRunId): Promise<AgentRunSnapshot>;
	/**
	 * Replay events for a run after the given cursor, for a client that polls the event
	 * stream while a run executes. The cursor is the opaque continuation returned by the
	 * previous append, so a client never re-reads events it already saw.
	 */
	listRunEvents(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly StoredAgentRunEventRecord[]>;
	/**
	 * Approve or reject a single pending tool call. Delegates to {@link decideMany};
	 * kept as a convenience so callers need not wrap one call id in a batch.
	 */
	decide(actor: ActorContext, input: DecideAgentRunInput): Promise<AgentRunSnapshot>;
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
	decideMany(actor: ActorContext, input: DecideAgentRunBatchInput): Promise<AgentRunSnapshot>;
	/**
	 * Request cancellation of a run, aborting any in-process execution immediately.
	 *
	 * When the run was still queued the cancellation is also recorded as an event so the
	 * client's event stream explains why the run never produced output.
	 */
	cancel(actor: ActorContext, runId: AgentRunId): Promise<AgentRunSnapshot>;
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
	retry(actor: ActorContext, runId: AgentRunId, requestId: string): Promise<AgentRunReceipt>;
	/**
	 * List the user's conversations, newest first, optionally filtered by free-text
	 * `query` and paginated by `limit`/`offset`.
	 */
	listSessions(
		actor: ActorContext,
		options?: { readonly limit?: number; readonly offset?: number; readonly query?: string }
	): Promise<readonly Conversation[]>;
	/**
	 * Change a conversation's title as it appears in the conversation list.
	 */
	renameSession(
		actor: ActorContext,
		conversationId: ConversationId,
		title: string
	): Promise<Conversation>;
	/**
	 * Delete a conversation and its message history.
	 *
	 * Refused while the conversation has an active agent run: deleting the transcript out
	 * from under a run that is still executing would strand it. Stop or resolve the run
	 * first.
	 *
	 * @throws ValidationError if the conversation has an active run.
	 */
	deleteSession(actor: ActorContext, conversationId: ConversationId): Promise<void>;
}

/**
 * Everything the {@link AgentController} needs to do its work, injected so the
 * controller can be built and tested with repository and provider fakes.
 */
export interface AgentDependencies {
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	/** Persists conversations and their message history. */
	conversationJournal: ConversationJournal;
	/** Per-user agent preferences used to settle defaults when a run is frozen. */
	preferences: AgentPreferencesStore;
	/** The catalogue of selectable models, used to validate and resolve run models. */
	models: AgentModelCatalog;
	/** Run records: idempotent inserts, lookups by id/request id, cancellation and requeue. */
	runs: AgentRunRepository;
	/** The append-only event log per run that clients poll via cursors. */
	events: AgentRunEventRepository;
	/** Recorded approvals and rejections for pending tool calls. */
	decisions: AgentRunDecisionRepository;
	/** Provider session items, replaced wholesale when a conversation is rewound. */
	sessions: AgentSessionRepository;
	/** Executes run mutations atomically so a run is all-or-nothing. */
	transactionRunner: TransactionRunner;
	/** Deployment fallback chat model when the user has not chosen one. */
	defaultModel: string;
	/** Deployment fallback vision model when the user has not chosen one. */
	defaultVisionModel: string;

	readonly settlements: RunSettlement;

	readonly contextFormatter: AgentContext;

	readonly contextNotes: NoteReader;

	readonly contextSkills: Pick<SkillFinder, 'listEnabled'>;

	readonly builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'>;

	readonly contextMemory: Pick<MemoryLibrary, 'list'>;

	readonly contextProjects: ProjectReader;

	readonly contextConversations: Pick<ConversationArchive, 'get'>;

	readonly provenance: ProvenanceRecorder;

	readonly runner: AgentRunner;

	readonly eventBus: Pick<AgentEventBus, 'notify'>;
}

/** Concrete {@link AgentController} orchestrating the run lifecycle against its injected repositories and the background execution engine. */
export class Agent implements AgentController {
	async synchronize(
		actor: ActorContext,
		input: ConversationMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, target);
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: ConversationMutationRequest
	): Promise<void> {
		await this.renameSession(actor, input.command.conversationId, input.command.title);
	}
	constructor(private readonly dependencies: AgentDependencies) {}

	listSessions(
		actor: ActorContext,
		options?: { readonly limit?: number; readonly offset?: number; readonly query?: string }
	): Promise<readonly Conversation[]> {
		return this.dependencies.conversationJournal.listConversations(actor, options);
	}

	renameSession(
		actor: ActorContext,
		conversationId: ConversationId,
		title: string
	): Promise<Conversation> {
		return this.dependencies.conversationJournal.rename(actor, conversationId, title);
	}

	async deleteSession(actor: ActorContext, conversationId: ConversationId): Promise<void> {
		const active = await this.dependencies.runs.findActiveByConversation(actor, conversationId);
		if (active)
			throw new ValidationError('Stop or resolve the active agent run before deleting this chat');
		await this.dependencies.conversationJournal.remove(actor, conversationId);
	}

	async submit(actor: ActorContext, input: SubmitAgentRunInput): Promise<AgentRunReceipt> {
		const existing = await this.dependencies.runs.findByRequestId(actor, input.requestId);
		if (existing) return this.receipt(actor, existing);
		if (input.model) await this.dependencies.models.assertSelectable(input.model);
		try {
			const receipt = await this.dependencies.transactionRunner.run(async () => {
				const submittedAt = now();
				// Limits are frozen onto the input alongside the prompt: a run replayed
				// later should run under the settings it was submitted with, not
				// whatever they have since become.
				const preferences = await this.dependencies.preferences.get(actor);
				const runInput = this.freezeInput(input, preferences);
				const conversation = await this.dependencies.conversationJournal.getOrCreate(
					actor,
					runInput
				);
				if (input.retryUserOrdinal !== undefined)
					await this.rewind(actor, conversation.id, input.retryUserOrdinal);
				const model = resolveAgentModel(conversation, preferences, this.dependencies.defaultModel);
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
				const submittedTraceparent = activeTraceparent();
				const run: AgentRun = {
					kind: 'agent',
					id: crypto.randomUUID() as AgentRunId,
					userId: actor.userId,
					conversationId: conversation.id,
					model,
					executionMode: resolveAgentExecutionMode(conversation, preferences),
					status: 'queued',
					requestId: input.requestId,
					pendingDecisions: [],
					inputSnapshot: finalInput,
					...(submittedTraceparent ? { traceparent: submittedTraceparent } : {}),
					definitionVersion: 2,
					createdAt: submittedAt,
					updatedAt: submittedAt
				};
				const inserted = await this.dependencies.runs.insertIdempotent(actor, run);
				if (!inserted) throw new DuplicateSubmission();
				await this.dependencies.conversationJournal.recordUserPrompt(
					actor,
					conversation.id,
					runInput.prompt,
					run.id,
					runInput.images
				);
				const event = await this.dependencies.events.append(run.id, 0, {
					type: 'run_queued',
					runId: run.id,
					attempt: 1,
					reason: 'submitted'
				});
				return {
					runId: run.id,
					conversationId: conversation.id,
					status: run.status,
					latestCursor: event.cursor
				};
			});
			this.executeInBackground(receipt.runId);
			return receipt;
		} catch (error) {
			if (!(error instanceof DuplicateSubmission)) this.raiseActiveRunConflict(error);
			const duplicate = await this.dependencies.runs.findByRequestId(actor, input.requestId);
			if (!duplicate) throw error;
			return this.receipt(actor, duplicate);
		}
	}

	async getRun(actor: ActorContext, runId: AgentRunId): Promise<AgentRunSnapshot> {
		const run = await this.dependencies.runs.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return this.snapshot(actor, run);
	}

	/**
	 * Preserve unreadable rows so consumers can report the loss and checkpoint
	 * their cursors, including when the final saved event is unreadable.
	 */
	async listRunEvents(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly StoredAgentRunEventRecord[]> {
		const stored = await this.dependencies.events.replay(actor, runId, after);
		const unreadable = stored.filter((record) => record.kind === 'unreadable');
		if (unreadable.length > 0)
			console.warn(
				`[agent] ${unreadable.length} stored run event(s) in the replay of ${runId} no longer match the event union: ${unreadable
					.map((record) => `${record.cursor}: ${record.reason}`)
					.join('; ')}`
			);
		return stored;
	}

	decide(actor: ActorContext, input: DecideAgentRunInput): Promise<AgentRunSnapshot> {
		const { callId, ...rest } = input;
		return this.decideMany(actor, { ...rest, callIds: [callId] });
	}

	async decideMany(
		actor: ActorContext,
		input: DecideAgentRunBatchInput
	): Promise<AgentRunSnapshot> {
		const snapshot = await this.dependencies.transactionRunner.run(async () => {
			const run = await this.requireRun(actor, input.runId);
			if (run.status !== 'awaiting_approval' && run.status !== 'queued')
				throw new ValidationError('The agent run is not awaiting approval');
			// All or nothing: half a batch recorded against a run that then requeues would
			// leave the user staring at cards whose decision silently went nowhere.
			for (const callId of input.callIds)
				if (!run.pendingDecisions.some((pending) => pending.callId === callId))
					throw new ValidationError('The pending tool call was not found');
			for (const callId of input.callIds)
				await this.dependencies.decisions.record(actor, {
					runId: input.runId,
					callId,
					decision: input.decision,
					...(input.message === undefined ? {} : { message: input.message })
				});
			const queued = await this.dependencies.runs.requeueAfterDecision(actor, run.id, now());
			if (run.status === 'awaiting_approval')
				await this.dependencies.events.append(run.id, 0, {
					type: 'run_queued',
					runId: run.id,
					attempt: 1,
					reason: 'resumed'
				});
			return this.snapshot(actor, queued);
		});
		this.executeInBackground(input.runId);
		return snapshot;
	}

	async cancel(actor: ActorContext, runId: AgentRunId): Promise<AgentRunSnapshot> {
		const run = await this.dependencies.transactionRunner.run(async () => {
			const requested = await this.dependencies.runs.requestCancellation(actor, runId, now());
			if (requested.status === 'cancelled')
				await this.dependencies.events.append(requested.id, 0, {
					type: 'cancelled',
					runId: requested.id,
					message: 'The request was cancelled before it started'
				});
			return requested;
		});
		// The abort waits for the commit above: the executor settles the run out of
		// `cancelling`, which has to be durable before it can read it.
		if (abortActiveRun(runId)) {
			this.settleCancellationAfterGrace(runId);
			return this.snapshot(actor, run);
		}
		// No in-process execution to abort. A run parked on an approval, or one
		// started by another process, would otherwise sit in `cancelling` forever.
		if (run.status !== 'cancelling') return this.snapshot(actor, run);
		const cancelled = await this.finishCancellation(runId);
		return this.snapshot(actor, cancelled ?? run);
	}

	/**
	 * `cancelling` must be transient even when the execution never unwinds: a hung
	 * provider call, or a tool doing local work the signal cannot reach, would
	 * otherwise park the row forever. The executor settling first makes this a
	 * no-op compare-and-set, so the cancelled event is still appended exactly once.
	 */
	private settleCancellationAfterGrace(runId: AgentRunId): void {
		const timer = setTimeout(() => {
			// audit-allow: silent-catch — this detached grace timer has no request caller; failure is emitted as an operational error for repair.
			this.finishCancellation(runId).catch((error) =>
				console.error(`[agent-run] Could not settle cancelled run ${runId}:`, error)
			);
		}, CANCELLATION_GRACE_MS);
		timer.unref();
	}

	async retry(actor: ActorContext, runId: AgentRunId, requestId: string): Promise<AgentRunReceipt> {
		const duplicate = await this.dependencies.runs.findByRequestId(actor, requestId);
		if (duplicate) return this.receipt(actor, duplicate);
		try {
			const receipt = await this.dependencies.transactionRunner.run(async () => {
				const original = await this.requireAgentRun(actor, runId);
				if (!isTerminalAgentRunStatus(original.status) || original.status === 'completed')
					throw new ValidationError('Only failed or cancelled runs can be retried');
				const submittedAt = now();
				// Joins the retry request's trace, same as a fresh submit.
				const retryTraceparent = activeTraceparent();
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
				const inserted = await this.dependencies.runs.insertIdempotent(actor, retry);
				if (!inserted) throw new DuplicateSubmission();
				const event = await this.dependencies.events.append(retry.id, 0, {
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
			const existing = await this.dependencies.runs.findByRequestId(actor, requestId);
			if (!existing) throw error;
			return this.receipt(actor, existing);
		}
	}

	private executeInBackground(runId: AgentRunId): void {
		const controller = registerActiveRun(runId);
		const cleanup = () => releaseActiveRun(runId);
		// audit-allow: silent-catch — detached execution persists a failed run; only failure of that settlement reaches the terminal reporter.
		void this.execute(runId, controller.signal)
			.then(cleanup, async (error) => {
				cleanup();
				// Without this the run stays `running` forever, holding the
				// conversation's single active-run slot and its open event stream.
				await this.failRun(runId, error instanceof Error ? error : new Error(String(error)));
			})
			.catch((error) =>
				console.error(`[agent-run] Background execution could not be settled for ${runId}:`, error)
			);
	}

	/**
	 * Discard a user turn and everything after it, so an edited or re-asked
	 * question can be submitted as an ordinary run. Both halves of the record
	 * have to go: the transcript the client hydrates from, and the provider
	 * session the run replays.
	 */
	private async rewind(
		actor: ActorContext,
		conversationId: ConversationId,
		ordinal: number
	): Promise<void> {
		const active = await this.dependencies.runs.findActiveByConversation(actor, conversationId);
		if (active) throw new ValidationError('Wait for the current agent run to finish first');
		await this.dependencies.conversationJournal.truncateFromUserMessage(
			actor,
			conversationId,
			ordinal
		);
		const items = await this.dependencies.sessions.list(actor, conversationId);
		const rewound = rewindToUserItem(
			items.map((item) => item.item),
			ordinal
		);
		if (rewound) await this.dependencies.sessions.replace(conversationId, rewound);
	}

	private freezeInput(
		input: SubmitAgentRunInput,
		preferences: AgentPreferences
	): StagedAgentRunInput {
		// Both channels share one budget: they end up in the same request.
		const images = allImages(input);
		if (images.length > 4) throw new ValidationError('Attach at most four images.');
		const imageBytes = images.reduce((sum, image) => {
			if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType))
				throw new ValidationError('Chat images must be PNG, JPEG, or WebP.');
			if (!image.dataUrl.startsWith(`data:${image.mediaType};base64,`))
				throw new ValidationError('Chat image content does not match its media type.');
			return sum + Buffer.byteLength(image.dataUrl.split(',')[1] ?? '', 'base64');
		}, 0);
		if (imageBytes > 10 * 1024 * 1024)
			throw new ValidationError('Chat images must be 10 MiB combined or less.');
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
				...skillsForSurface(input.appContext?.surface?.kind)
			])
		];
		// Only the fields the user actually set travel; an empty object would
		// otherwise override the deployment defaults with nothing.
		const webSearch = {
			...(preferences.webSearchEngine ? { engine: preferences.webSearchEngine } : {}),
			...(preferences.webSearchMaxResults ? { maxResults: preferences.webSearchMaxResults } : {}),
			...(preferences.webSearchMaxTotalResults
				? { maxTotalResults: preferences.webSearchMaxTotalResults }
				: {})
		};
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
			...(Object.keys(webSearch).length > 0 ? { webSearch } : {})
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
	 * them. A catalogue lookup that fails falls through to describing: a wasted
	 * caption call is recoverable, a discarded image is not.
	 */
	private async withImageReader(
		runInput: RunAgentInput,
		chatModel: string,
		conversation: Conversation,
		preferences: AgentPreferences
	): Promise<RunAgentInput> {
		// Context images need a model that can see just as much as attachments do;
		// ignoring them here would silently drop the render on a text-only model.
		if (allImages(runInput).length === 0) return runInput;
		const models = await this.dependencies.models.list();
		if (models.find((candidate) => candidate.id === chatModel)?.supportsVision) {
			const { visionModelOverride: _discarded, ...rest } = runInput;
			return rest;
		}
		return {
			...runInput,
			visionModelOverride: resolveVisionModel(
				conversation,
				preferences,
				this.dependencies.defaultVisionModel
			)
		};
	}

	private async requireRun(actor: ActorContext, runId: AgentRunId): Promise<AgentRun> {
		const run = await this.dependencies.runs.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	private async requireAgentRun(actor: ActorContext, runId: AgentRunId): Promise<ResolvedAgentRun> {
		const run = await this.dependencies.runs.findAgentById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	private async receipt(actor: ActorContext, run: AgentRun): Promise<AgentRunReceipt> {
		return {
			runId: run.id,
			conversationId: run.conversationId,
			status: run.status,
			latestCursor: await this.dependencies.events.latestCursor(actor, run.id)
		};
	}

	private async snapshot(actor: ActorContext, run: AgentRun): Promise<AgentRunSnapshot> {
		return {
			run,
			latestCursor: await this.dependencies.events.latestCursor(actor, run.id),
			pendingDecisions: run.pendingDecisions
		};
	}

	/**
	 * Raises, always. It used to answer `unknown` so both call sites could
	 * `throw` its result, which put an `unknown` on a controller's surface to
	 * describe a value nobody ever holds: every path out of here is a throw.
	 */
	// audit-allow: no-unknown-type — TypeScript types a caught error as unknown; this is one.
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
			const actor: ActorContext = { userId: run.userId };
			const request = run.inputSnapshot;
			const decisions = await this.dependencies.decisions.loadUnconsumed(run.id);
			const toolExecutor: AgentToolExecutor = {
				execute: async (input, action) => {
					const output = await action();
					if (input.classification !== 'mutation') return output;
					await this.persistEvent(run, actor, {
						type: 'resources_stale',
						resources: ['workspace']
					});
					return output;
				}
			};
			for await (const update of this.dependencies.runner.execute({
				actor,
				run,
				request,
				context: run.contextSnapshot,
				...(decisions.length > 0 ? { decisions } : {}),
				signal,
				toolExecutor
			})) {
				// A runner that swallows the abort and keeps yielding still settles
				// here, at the next boundary, instead of wedging in `cancelling`.
				if (signal.aborted) {
					await this.finishCancellation(run.id);
					return 'cancelled';
				}
				if (update.type === 'event') {
					await this.persistEvent(run, actor, update.event);
					continue;
				}
				if (update.type === 'approval_checkpoint') {
					let parked: AgentRun | undefined;
					await this.dependencies.transactionRunner.run(async () => {
						parked = await this.dependencies.runs.transition(
							run.id,
							'running',
							'awaiting_approval',
							{
								serializedState: update.serializedState,
								// Carried across the park so the resumed turn joins this run's
								// trace rather than opening a second one for the same request.
								...(update.traceparent ? { traceparent: update.traceparent } : {}),
								pendingDecisions: update.pendingDecisions,
								updatedAt: new Date().toISOString() as DateTime
							}
						);
						if (!parked) return;
						await this.dependencies.sessions.replace(run.conversationId, update.sessionItems);
						for (const decision of decisions)
							await this.dependencies.decisions.consume(run.id, decision.callId, new Date());
						for (const pending of update.pendingDecisions) {
							const event: AgentEvent = {
								type: 'approval_required',
								runId: run.id,
								callId: pending.callId,
								name: pending.toolName,
								arguments: pending.arguments,
								...(pending.review ? { review: pending.review } : {})
							};
							const record = await this.dependencies.events.append(run.id, 1, event);
							const activity = toolActivityFromEvent(event);
							if (activity)
								await this.dependencies.conversationJournal.recordToolActivity(
									actor,
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
					// Publish only after the checkpoint and its approval events commit together.
					this.dependencies.eventBus.notify(run.id);
					return 'awaiting_approval';
				}
				const settled = await this.complete(
					run,
					actor,
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
			// A cancel that lands mid-prepare turns the snapshot write into an
			// illegal `cancelling → running` update, and the abort can lag the
			// commit that parked the row. Either way the run is settling, not
			// failing; `finishCancellation` no-ops for any other status, so a
			// settled row is what distinguishes the race from a real failure.
			const settled = await this.finishCancellation(runId);
			if (signal.aborted || settled) return 'cancelled';
			throw error;
		}
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
			await this.dependencies.decisions.clearPending(runId);

			return this.dependencies.settlements.complete(settlement);
		});
		if (result.kind === 'lost') return undefined;
		this.dependencies.eventBus.notify(runId);
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
			if (failed.kind === 'settled') {
				this.dependencies.eventBus.notify(runId);
				return;
			}

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
		const transitioned = await this.dependencies.runs.transitionAgent(runId, 'queued', 'running', {
			startedAt: new Date().toISOString() as DateTime
		});
		if (!transitioned) return undefined;
		let run = transitioned;
		const actor: ActorContext = { userId: run.userId };

		if (!run.provenanceId) {
			const provenance = await this.dependencies.provenance.record(actor, {
				producerKind: 'agent',
				producerName: 'FollowThrough Workbench Agent',
				pipeline: 'agent',
				runId: run.id,
				model: run.model,
				metadata: {}
			});
			run = { ...run, provenanceId: provenance.id };
			await this.dependencies.runs.update(actor, run);
		}

		if (!run.contextSnapshot) {
			const context = await this.buildContext(actor, run.inputSnapshot);
			run = { ...run, contextSnapshot: context };
			await this.dependencies.runs.update(actor, run);
		}

		await this.dependencies.events.append(run.id, 1, {
			type: 'run_started',
			runId: run.id,
			attempt: 1
		});
		this.dependencies.eventBus.notify(run.id);

		return run as PreparedAgentRun;
	}

	private async buildContext(actor: ActorContext, input: RunAgentInput): Promise<AgentRunContext> {
		await this.dependencies.transactionRunner.run(() =>
			this.dependencies.builtInSkills.ensure(actor)
		);
		const current = input.noteId
			? {
					kind: 'note' as const,
					note: await this.dependencies.contextNotes.get(actor, input.noteId)
				}
			: { kind: 'no_current_note' as const };
		const base = this.dependencies.contextFormatter.base(input, current);
		const [skills, contextNotes, profileMemory] = await Promise.all([
			this.dependencies.contextSkills.listEnabled(actor, base.projectId),
			Promise.all(
				(input.contextNoteIds ?? []).map((noteId) => this.loadAttachedNote(actor, noteId))
			),
			this.dependencies.contextMemory.list(actor, {})
		]);
		if (!input.appContext)
			return this.dependencies.contextFormatter.build(input, {
				base,
				skills,
				contextNotes,
				profileMemory
			});
		const conversation = await this.dependencies.contextConversations.get(
			actor,
			input.conversationId
		);
		const origin = conversation.contextProjectId
			? {
					kind: 'project' as const,
					project: await this.dependencies.contextProjects.get(actor, conversation.contextProjectId)
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
				profileMemory,
				appContext
			});
		const requested = input.requestedScope;
		const [project, note] = await Promise.all([
			requested.projectId
				? this.dependencies.contextProjects.get(actor, requested.projectId)
				: undefined,
			requested.noteId ? this.dependencies.contextNotes.get(actor, requested.noteId) : undefined
		]);
		const requestedScope = this.dependencies.contextFormatter.requestedScope(input.appContext, {
			project,
			note
		});
		return this.dependencies.contextFormatter.build(input, {
			base,
			skills,
			contextNotes,
			profileMemory,
			appContext: { ...appContext, requestedScope }
		});
	}

	private async loadAttachedNote(actor: ActorContext, noteId: NoteId) {
		try {
			return await this.dependencies.contextNotes.get(actor, noteId);
		} catch (error) {
			if (!(error instanceof NotFoundError)) throw error;
			throw new NotFoundError(
				'An attached note is no longer available. Remove it from context and retry.',
				{ noteId }
			);
		}
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
		const actor: ActorContext = { userId: run.userId };
		for (const pending of run.pendingDecisions)
			await this.dependencies.conversationJournal.recordToolActivity(
				actor,
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
		await this.dependencies.runs.update(actor, { ...run, pendingDecisions: [] });
	}

	private async persistEvent(
		run: AgentRun,
		actor: ActorContext,
		event: AgentEvent
	): Promise<AgentRunEventRecord> {
		const record = await this.dependencies.transactionRunner.run(async () => {
			const record = await this.dependencies.events.append(run.id, 1, event);
			const activity = toolActivityFromEvent(event);
			if (activity)
				await this.dependencies.conversationJournal.recordToolActivity(
					actor,
					run.conversationId,
					activity,
					{
						runId: run.id,
						eventCursor: record.cursor
					}
				);
			return record;
		});
		this.dependencies.eventBus.notify(run.id);
		return record;
	}

	private async complete(
		run: AgentRun,
		actor: ActorContext,
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

			await this.dependencies.sessions.replace(run.conversationId, sessionItems);
			for (const callId of decisionCallIds)
				await this.dependencies.decisions.consume(run.id, callId, new Date());
			// One message per contiguous run of output, each carrying the cursor it began at.
			// Written as a single blob it could only be replayed after every tool call, which
			// is why a reopened conversation read as "all the work, then all the words".
			const segments = await this.dependencies.events.reconstructOutput(run.id, 1);
			for (const segment of segments) {
				const provenance = { runId: run.id, eventCursor: segment.cursor };
				if (segment.kind === 'reasoning')
					await this.dependencies.conversationJournal.recordAssistantReasoning(
						actor,
						run.conversationId,
						segment.text,
						run.model,
						provenance
					);
				else
					await this.dependencies.conversationJournal.recordAssistantText(
						actor,
						run.conversationId,
						segment.text,
						run.model,
						provenance
					);
			}

			return this.dependencies.settlements.complete(settlement);
		});
		if (settled.kind === 'settled') this.dependencies.eventBus.notify(run.id);
		return settled.kind === 'settled';
	}

	async recoverInterruptedRuns(): Promise<number> {
		const interrupted = await this.dependencies.runs.listInterrupted();
		for (const run of interrupted) {
			if (run.kind === 'agent') {
				if (run.status === 'cancelling') await this.finishCancellation(run.id);
				else await this.failRun(run.id, new Error('Process restarted'));
			} else {
				const result = await this.dependencies.transactionRunner.run(async () => {
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
				if (result.kind === 'settled') this.dependencies.eventBus.notify(run.id);
			}
		}
		return interrupted.length;
	}
}
