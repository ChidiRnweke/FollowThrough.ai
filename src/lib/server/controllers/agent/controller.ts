import type { ActorContext } from '$lib/models/identity';
import type {
	AgentEvent,
	AgentPreferences,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunId,
	AgentRunReceipt,
	AgentRunEventRecord,
	AgentRunSnapshot,
	AgentSessionItem,
	Conversation,
	ConversationId,
	DecideAgentRunBatchInput,
	DecideAgentRunInput,
	Message,
	RunAgentInput,
	SubmitAgentRunInput
} from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import { isTerminalAgentRunStatus } from '$lib/models/agent';
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
import type { AgentRunLifecycle } from '$lib/server/services/agent/runs/lifecycle';
import { rewindToUserItem } from '$lib/server/services/agent/conversations/rewind';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';

interface AgentRunRepository {
	findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined>;
	findByRequestId(actor: ActorContext, requestId: string): Promise<AgentRun | undefined>;
	findLatestByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined>;
	findActiveByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined>;
	insertIdempotent(actor: ActorContext, run: AgentRun): Promise<AgentRun | undefined>;
	requestCancellation(actor: ActorContext, runId: AgentRunId, at: DateTime): Promise<AgentRun>;
	requeueAfterDecision(actor: ActorContext, runId: AgentRunId, at: DateTime): Promise<AgentRun>;
}

interface AgentRunEventRepository {
	append(runId: AgentRunId, attempt: number, event: AgentEvent): Promise<AgentRunEventRecord>;
	replay(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly AgentRunEventRecord[]>;
	latestCursor(actor: ActorContext, runId: AgentRunId): Promise<string>;
}

interface AgentRunDecisionRepository {
	record(
		actor: ActorContext,
		input: {
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly decision: 'approve' | 'reject';
			readonly message?: string;
		}
	): Promise<AgentRunDecisionRecord>;
}

interface AgentSessionRepository {
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly AgentSessionItem[]>;
	replace(
		conversationId: ConversationId,
		items: readonly Readonly<Record<string, unknown>>[]
	): Promise<void>;
}

const now = (): DateTime => new Date().toISOString() as DateTime;

class DuplicateSubmission extends Error {}

/**
 * Application boundary for the agent: submitting runs, streaming their events, and
 * managing the conversations (chats) they happen in. Controllers know nothing about
 * transports; this one deals in run receipts, snapshots, and event cursors.
 */
export interface AgentController {
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
	): Promise<readonly AgentRunEventRecord[]>;
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
	/**
	 * Load a conversation with its full message history and, when one exists, its most
	 * recent run as a snapshot, so a single call can hydrate a chat view.
	 */
	getSession(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<{
		conversation: Conversation;
		messages: readonly Message[];
		latestRun?: AgentRunSnapshot;
	}>;
}

/**
 * Everything the {@link AgentController} needs to do its work, injected so the
 * controller can be built and tested without touching real stores or the executor.
 */
export interface AgentDependencies {
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
	/** Executes queued runs in the background and reports their lifecycle. */
	executor: AgentRunLifecycle;
}

const activeRuns = new Map<AgentRunId, AbortController>();

/** Concrete {@link AgentController} orchestrating the run lifecycle against its injected repositories and the background execution engine. */
export class Agent implements AgentController {
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

	async getSession(actor: ActorContext, conversationId: ConversationId) {
		const [conversation, messages, latest] = await Promise.all([
			this.dependencies.conversationJournal.get(actor, conversationId),
			this.dependencies.conversationJournal.listMessages(actor, conversationId),
			this.dependencies.runs.findLatestByConversation(actor, conversationId)
		]);
		return {
			conversation,
			messages,
			...(latest ? { latestRun: await this.snapshot(actor, latest) } : {})
		};
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
				const finalInput = await this.withImageReader(runInput, model, conversation, preferences);
				const run: AgentRun = {
					id: crypto.randomUUID() as AgentRunId,
					userId: actor.userId,
					conversationId: conversation.id,
					model,
					executionMode: resolveAgentExecutionMode(conversation, preferences),
					status: 'queued',
					requestId: input.requestId,
					pendingDecisions: [],
					contextSnapshot: {},
					inputSnapshot: finalInput as unknown as Readonly<Record<string, unknown>>,
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
			if (!(error instanceof DuplicateSubmission)) throw this.mapActiveRunConflict(error);
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

	listRunEvents(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly AgentRunEventRecord[]> {
		return this.dependencies.events.replay(actor, runId, after);
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
		const controller = activeRuns.get(runId);
		if (controller) {
			controller.abort();
			return this.snapshot(actor, run);
		}
		// No in-process execution to abort. A run parked on an approval, or one
		// started by another process, would otherwise sit in `cancelling` forever.
		if (run.status !== 'cancelling') return this.snapshot(actor, run);
		const cancelled = await this.dependencies.executor.finishCancellation(runId);
		return this.snapshot(actor, cancelled ?? run);
	}

	async retry(actor: ActorContext, runId: AgentRunId, requestId: string): Promise<AgentRunReceipt> {
		const duplicate = await this.dependencies.runs.findByRequestId(actor, requestId);
		if (duplicate) return this.receipt(actor, duplicate);
		try {
			const receipt = await this.dependencies.transactionRunner.run(async () => {
				const original = await this.requireRun(actor, runId);
				if (!isTerminalAgentRunStatus(original.status) || original.status === 'completed')
					throw new ValidationError('Only failed or cancelled runs can be retried');
				const submittedAt = now();
				const retry: AgentRun = {
					id: crypto.randomUUID() as AgentRunId,
					userId: original.userId,
					conversationId: original.conversationId,
					model: original.model,
					executionMode: original.executionMode,
					status: 'queued',
					requestId,
					pendingDecisions: [],
					contextSnapshot: {},
					inputSnapshot: original.inputSnapshot,
					retryOfRunId: original.id,
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
			if (!(error instanceof DuplicateSubmission)) throw this.mapActiveRunConflict(error);
			const existing = await this.dependencies.runs.findByRequestId(actor, requestId);
			if (!existing) throw error;
			return this.receipt(actor, existing);
		}
	}

	executeInBackground(runId: AgentRunId): void {
		const controller = new AbortController();
		activeRuns.set(runId, controller);
		const cleanup = () => activeRuns.delete(runId);
		this.dependencies.executor.execute(runId, controller.signal).then(cleanup, (error) => {
			cleanup();
			console.error(`[agent-run] Background execution failed for ${runId}:`, error);
			// Without this the run stays `running` forever, holding the
			// conversation's single active-run slot and its open event stream.
			void this.dependencies.executor.failRun(runId, error);
		});
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

	private freezeInput(input: SubmitAgentRunInput, preferences: AgentPreferences): RunAgentInput {
		if ((input.images?.length ?? 0) > 4) throw new ValidationError('Attach at most four images.');
		const imageBytes = (input.images ?? []).reduce((sum, image) => {
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
			...(input.conversationId ? { conversationId: input.conversationId } : {}),
			...((contextProjectId ?? input.projectId)
				? { projectId: contextProjectId ?? input.projectId }
				: {}),
			...((contextNoteId ?? input.noteId) ? { noteId: contextNoteId ?? input.noteId } : {}),
			...(input.selection ? { selection: input.selection } : {}),
			...(input.contextNoteIds ? { contextNoteIds: input.contextNoteIds } : {}),
			...(input.requestedSkillNames ? { requestedSkillNames: input.requestedSkillNames } : {}),
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
		if (!runInput.images?.length) return runInput;
		const models = await this.dependencies.models.list().catch(() => []);
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

	private mapActiveRunConflict(error: unknown): unknown {
		if (
			typeof error === 'object' &&
			error !== null &&
			'constraint_name' in error &&
			error.constraint_name === 'agent_runs_active_conversation_unique'
		)
			return new ValidationError('This conversation already has an active agent run');
		return error;
	}
}
