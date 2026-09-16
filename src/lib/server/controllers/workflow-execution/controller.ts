import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { AtomicOperation } from '$lib/models/workspace';
import type { ActorContext } from '$lib/models/identity';
import type {
	AgentEvent,
	AgentRun,
	AgentRunId,
	AgentRunReceipt,
	Conversation,
	ConversationId
} from '$lib/models/agent';
import { readAgentPayload } from '$lib/models/agent/payload';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type {
	AgentRunEventRepository,
	AgentRunRepository
} from '$lib/server/services/agent/runs/execution-contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

interface WorkflowConversationRecorder {
	createWorkflow(
		actor: ActorContext,
		input: { title: string; contextNoteId?: NoteId }
	): Promise<Conversation>;
}

interface AgentEventBus {
	notify(runId: AgentRunId): void;
}

/** The in-process handle for a run executing in this process, so cancellation can abort it. */
export interface ActiveRunRegistry {
	register(runId: AgentRunId): AbortController;
	release(runId: AgentRunId): void;
}

export interface WorkflowRunnerDependencies {
	readonly runs: AgentRunRepository;
	readonly settlements: RunSettlement;
	readonly transactions: AtomicOperation;
	readonly events: AgentRunEventRepository;
	readonly conversations: WorkflowConversationRecorder;
	readonly eventBus: AgentEventBus;
	readonly activeRuns: ActiveRunRegistry;
	/** Deployment fallback for actions that expose no model choice of their own. */
	readonly defaultModel: string;
}

import type {
	WorkflowRunTask,
	WorkflowRunStarter
} from '$lib/server/services/agent/runs/execution-contracts';

/**
 * Runs one note action as a first-class agent run.
 *
 * The actions used to be a single awaited request, which made them impossible to
 * stop and impossible to recover: a refresh dropped the promise while the model
 * call carried on. Giving each one a run row and an event log buys both from
 * machinery chat already has — `cancelAgentRun` finds the run's controller in the
 * shared registry, and `/api/agent/runs/[runId]/events` replays the outcome to a
 * client that reconnects.
 *
 * Each action gets its own workflow conversation, so it never contends with the
 * user's chat run for the one-active-run-per-conversation slot.
 */
export class WorkflowRunner implements WorkflowRunStarter {
	constructor(private readonly dependencies: WorkflowRunnerDependencies) {}

	/**
	 * Returns as soon as the run is durable, before the work is done. The caller's
	 * request ends there; the result reaches the client over the event stream.
	 */
	async start<Result>(
		actor: ActorContext,
		task: WorkflowRunTask<Result>
	): Promise<AgentRunReceipt> {
		const { inserted, conversation, model, queued } = await this.dependencies.transactions.run(
			async () => {
				const conversation = await this.dependencies.conversations.createWorkflow(actor, {
					title: task.title,
					contextNoteId: task.noteId
				});
				const timestamp = now();
				const model = task.model ?? this.dependencies.defaultModel;
				const run: AgentRun = {
					kind: 'workflow',
					id: crypto.randomUUID() as AgentRunId,
					userId: actor.userId,
					conversationId: conversation.id,
					model,
					executionMode: 'auto_accept',
					status: 'running',
					requestId: crypto.randomUUID(),
					pendingDecisions: [],
					// `noteId` is what a client that lost its session storage searches by.
					contextSnapshot: { kind: 'note_action', action: task.action, noteId: task.noteId },
					startedAt: timestamp,
					definitionVersion: 2,
					createdAt: timestamp,
					updatedAt: timestamp
				};
				const inserted = await this.dependencies.runs.insert(actor, run);
				const queued = await this.dependencies.events.append(inserted.id, 1, {
					type: 'run_queued',
					runId: inserted.id,
					attempt: 1,
					reason: 'submitted'
				});
				return { inserted, conversation, model, queued };
			}
		);
		this.dependencies.eventBus.notify(inserted.id);
		// audit-allow: silent-catch — detached workflow execution persists its own terminal state; settlement failure is emitted for operational repair.
		void this.execute(inserted.id, conversation.id, model, task).catch((error) =>
			console.error(
				`[workflow-run] Background execution could not be settled for ${inserted.id}:`,
				error
			)
		);
		return {
			runId: inserted.id,
			conversationId: conversation.id,
			status: inserted.status,
			latestCursor: queued.cursor
		};
	}

	private async execute<Result>(
		runId: AgentRunId,
		conversationId: ConversationId,
		model: string,
		task: WorkflowRunTask<Result>
	): Promise<void> {
		const controller = this.dependencies.activeRuns.register(runId);
		try {
			await this.append(runId, { type: 'run_started', runId, attempt: 1 });
			const result = await task.run(controller.signal);
			// The one place a domain result becomes wire JSON. A result that cannot
			// be represented raises here, so the run settles as failed with that
			// reason rather than persisting a value the replay would hand back as
			// something other than what ran.
			const carried = readAgentPayload(result);
			if (carried.kind === 'corrupt')
				throw new Error(
					`The ${task.action} result could not be represented as JSON: ${carried.message}`
				);
			const settled = await this.dependencies.transactions.run(async () => {
				const settlement = await this.dependencies.settlements.claim(runId, {
					kind: 'workflow_completed',
					conversationId,
					model,
					action: task.action,
					result: carried.value
				});
				if (settlement.kind === 'lost') return settlement;

				return this.dependencies.settlements.complete(settlement);
			});
			if (settled.kind === 'settled') this.dependencies.eventBus.notify(runId);
			else await this.settleCancelled(runId);

			// audit-allow: silent-catch — execution failure is converted to a durable cancelled or failed run before this detached task returns.
		} catch (error) {
			// `cancel` commits `cancelling` before it aborts, so an aborted signal
			// always has a row waiting in that state to settle.
			if (controller.signal.aborted) await this.settleCancelled(runId);
			else
				await this.settleFailed(runId, error instanceof Error ? error : new Error(String(error)));
		} finally {
			this.dependencies.activeRuns.release(runId);
		}
	}

	private async settleCancelled(runId: AgentRunId): Promise<void> {
		const settled = await this.dependencies.transactions.run(async () => {
			const settlement = await this.dependencies.settlements.claim(runId, {
				kind: 'cancelled',
				message: 'Generation stopped'
			});
			if (settlement.kind === 'lost') return settlement;

			return this.dependencies.settlements.complete(settlement);
		});
		if (settled.kind === 'settled') this.dependencies.eventBus.notify(runId);
	}

	private async settleFailed(runId: AgentRunId, error: Error): Promise<void> {
		const message = error.message;
		try {
			const settled = await this.dependencies.transactions.run(async () => {
				const settlement = await this.dependencies.settlements.claim(runId, {
					kind: 'failed',
					code: 'WORKFLOW_FAILED',
					message,
					retryable: true
				});
				if (settlement.kind === 'lost') return settlement;

				return this.dependencies.settlements.complete(settlement);
			});
			if (settled.kind === 'settled') this.dependencies.eventBus.notify(runId);
			else await this.settleCancelled(runId);
		} catch (settlementError) {
			throw new AggregateError(
				[error, settlementError],
				`Workflow run ${runId} failed and its failure could not be persisted`,
				{ cause: settlementError }
			);
		}
	}

	private async append(runId: AgentRunId, event: AgentEvent) {
		const record = await this.dependencies.events.append(runId, 1, event);
		this.dependencies.eventBus.notify(runId);
		return record;
	}
}
