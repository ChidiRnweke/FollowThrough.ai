import type {
	ActorContext,
	AgentEvent,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunId,
	AgentRunReceipt,
	AgentRunEventRecord,
	AgentRunSnapshot,
	AgentSessionItem,
	Conversation,
	ConversationId,
	DateTime,
	DecideAgentRunBatchInput,
	DecideAgentRunInput,
	Message,
	RunAgentInput,
	SubmitAgentRunInput
} from '$lib/models';
import { isTerminalAgentRunStatus } from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	AgentModelCatalog,
	AgentPreferencesStore,
	ConversationJournal
} from '$lib/server/services';
import { resolveAgentExecutionMode, resolveAgentModel } from '$lib/server/services';
import type { AgentRunLifecycle } from '$lib/server/services/agent-runs/lifecycle';
import { rewindToUserItem } from '$lib/server/services/conversations/rewind';
import type { AtomicOperation as TransactionRunner } from '$lib/utils';

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

export interface AgentController {
	submit(actor: ActorContext, input: SubmitAgentRunInput): Promise<AgentRunReceipt>;
	getRun(actor: ActorContext, runId: AgentRunId): Promise<AgentRunSnapshot>;
	listRunEvents(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly AgentRunEventRecord[]>;
	decide(actor: ActorContext, input: DecideAgentRunInput): Promise<AgentRunSnapshot>;
	decideMany(actor: ActorContext, input: DecideAgentRunBatchInput): Promise<AgentRunSnapshot>;
	cancel(actor: ActorContext, runId: AgentRunId): Promise<AgentRunSnapshot>;
	retry(actor: ActorContext, runId: AgentRunId, requestId: string): Promise<AgentRunReceipt>;
	listSessions(
		actor: ActorContext,
		options?: { readonly limit?: number; readonly offset?: number; readonly query?: string }
	): Promise<readonly Conversation[]>;
	renameSession(
		actor: ActorContext,
		conversationId: ConversationId,
		title: string
	): Promise<Conversation>;
	deleteSession(actor: ActorContext, conversationId: ConversationId): Promise<void>;
	getSession(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<{
		conversation: Conversation;
		messages: readonly Message[];
		latestRun?: AgentRunSnapshot;
	}>;
}

export interface AgentDependencies {
	conversationJournal: ConversationJournal;
	preferences: AgentPreferencesStore;
	models: AgentModelCatalog;
	runs: AgentRunRepository;
	events: AgentRunEventRepository;
	decisions: AgentRunDecisionRepository;
	sessions: AgentSessionRepository;
	transactionRunner: TransactionRunner;
	defaultModel: string;
	executor: AgentRunLifecycle;
}

const activeRuns = new Map<AgentRunId, AbortController>();

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
				const runInput = this.freezeInput(input);
				const conversation = await this.dependencies.conversationJournal.getOrCreate(
					actor,
					runInput
				);
				if (input.retryUserOrdinal !== undefined)
					await this.rewind(actor, conversation.id, input.retryUserOrdinal);
				const preferences = await this.dependencies.preferences.get(actor);
				const run: AgentRun = {
					id: crypto.randomUUID() as AgentRunId,
					userId: actor.userId,
					conversationId: conversation.id,
					model: resolveAgentModel(conversation, preferences, this.dependencies.defaultModel),
					executionMode: resolveAgentExecutionMode(conversation, preferences),
					status: 'queued',
					requestId: input.requestId,
					pendingDecisions: [],
					contextSnapshot: {},
					inputSnapshot: runInput as unknown as Readonly<Record<string, unknown>>,
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
					run.id
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
		return this.dependencies.transactionRunner.run(async () => {
			const run = await this.dependencies.runs.requestCancellation(actor, runId, now());
			// Abort in-process execution immediately
			const controller = activeRuns.get(runId);
			if (controller) controller.abort();
			if (run.status === 'cancelled')
				await this.dependencies.events.append(run.id, 0, {
					type: 'cancelled',
					runId: run.id,
					message: 'The request was cancelled before it started'
				});
			return this.snapshot(actor, run);
		});
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

	private freezeInput(input: SubmitAgentRunInput): RunAgentInput {
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
				? (input.appContext.activeResource.id as import('$lib/models').NoteId)
				: undefined);
		const overriddenProjectId =
			input.projectId && contextProjectId && input.projectId !== contextProjectId
				? input.projectId
				: undefined;
		const overriddenNoteId =
			input.noteId && contextNoteId && input.noteId !== contextNoteId ? input.noteId : undefined;
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
			...(input.mode !== undefined ? { executionModeOverride: input.mode } : {})
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
