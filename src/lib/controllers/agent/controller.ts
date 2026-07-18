import type {
	ActorContext,
	AgentRun,
	AgentRunId,
	AgentRunReceipt,
	AgentRunEventRecord,
	AgentRunSnapshot,
	Conversation,
	ConversationId,
	DateTime,
	DecideAgentRunInput,
	Message,
	RunAgentInput,
	SubmitAgentRunInput
} from '$lib/models';
import { isTerminalAgentRunStatus, NotFoundError, ValidationError } from '$lib/models';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository,
	TransactionRunner
} from '$lib/repositories';
import type { AgentModelCatalog, AgentPreferencesStore, ConversationJournal } from '$lib/services';
import { resolveAgentExecutionMode, resolveAgentModel } from '$lib/services';
import type { AgentRunExecutor } from '$lib/server/domain/agent-run-executor';

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
	transactionRunner: TransactionRunner;
	defaultModel: string;
	executor: AgentRunExecutor;
}

const activeRuns = new Map<AgentRunId, AbortController>();

export class DefaultAgentController implements AgentController {
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
					definitionVersion: 1,
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

	async decide(actor: ActorContext, input: DecideAgentRunInput): Promise<AgentRunSnapshot> {
		const snapshot = await this.dependencies.transactionRunner.run(async () => {
			const run = await this.requireRun(actor, input.runId);
			if (run.status !== 'awaiting_approval' && run.status !== 'queued')
				throw new ValidationError('The agent run is not awaiting approval');
			if (!run.pendingDecisions.some((pending) => pending.callId === input.callId))
				throw new ValidationError('The pending tool call was not found');
			await this.dependencies.decisions.record(actor, input);
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
					definitionVersion: 1,
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

	private freezeInput(input: SubmitAgentRunInput): RunAgentInput {
		return {
			requestId: input.requestId,
			prompt: input.input,
			...(input.conversationId ? { conversationId: input.conversationId } : {}),
			...(input.projectId ? { projectId: input.projectId } : {}),
			...(input.noteId ? { noteId: input.noteId } : {}),
			...(input.selection ? { selection: input.selection } : {}),
			...(input.contextNoteIds ? { contextNoteIds: input.contextNoteIds } : {}),
			...(input.requestedSkillNames ? { requestedSkillNames: input.requestedSkillNames } : {}),
			...(input.requestedSkillNoteIds
				? { requestedSkillNoteIds: input.requestedSkillNoteIds }
				: {}),
			...(input.model !== undefined ? { modelOverride: input.model } : {}),
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
