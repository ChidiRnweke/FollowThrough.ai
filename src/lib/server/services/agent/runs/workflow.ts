import type { ActorContext } from '$lib/models/identity';
import type {
	AgentEvent,
	AgentRun,
	AgentRunId,
	AgentRunReceipt,
	Conversation,
	ConversationId,
	NoteActionKind
} from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunEventRepository, AgentRunRepository } from '$lib/server/repositories/agent';

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
	readonly events: AgentRunEventRepository;
	readonly conversations: WorkflowConversationRecorder;
	readonly eventBus: AgentEventBus;
	readonly activeRuns: ActiveRunRegistry;
	/** Deployment fallback for actions that expose no model choice of their own. */
	readonly defaultModel: string;
}

export interface WorkflowRunTask<Result> {
	readonly action: NoteActionKind;
	readonly noteId: NoteId;
	/** Names the run in the conversation list, e.g. "Convert Mermaid to draw.io". */
	readonly title: string;
	readonly model?: string;
	run(signal: AbortSignal): Promise<Result>;
}

/**
 * The seam controllers depend on: starting a note action without knowing how runs
 * are stored or streamed, so a controller test can drive one without a database.
 */
export interface WorkflowRunStarter {
	start<Result>(actor: ActorContext, task: WorkflowRunTask<Result>): Promise<AgentRunReceipt>;
}

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
		const conversation = await this.dependencies.conversations.createWorkflow(actor, {
			title: task.title,
			contextNoteId: task.noteId
		});
		const timestamp = now();
		const model = task.model ?? this.dependencies.defaultModel;
		const run: AgentRun = {
			id: crypto.randomUUID() as AgentRunId,
			userId: actor.userId,
			conversationId: conversation.id,
			model,
			executionMode: 'auto_accept',
			status: 'running',
			requestId: crypto.randomUUID(),
			pendingDecisions: [],
			// `noteId` is what a client that lost its session storage searches by.
			contextSnapshot: { action: task.action, noteId: task.noteId },
			startedAt: timestamp,
			definitionVersion: 1,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		const inserted = await this.dependencies.runs.insert(actor, run);
		const queued = await this.append(inserted.id, {
			type: 'run_queued',
			runId: inserted.id,
			attempt: 1,
			reason: 'submitted'
		});
		void this.execute(inserted.id, conversation.id, model, task);
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
			await this.append(runId, { type: 'workflow_result', action: task.action, result });
			await this.dependencies.runs.transition(runId, 'running', 'completed', {
				finishedAt: now()
			});
			await this.append(runId, { type: 'completed', conversationId, runId, model });
		} catch (error) {
			// `cancel` commits `cancelling` before it aborts, so an aborted signal
			// always has a row waiting in that state to settle.
			if (controller.signal.aborted) await this.settleCancelled(runId);
			else await this.settleFailed(runId, error);
		} finally {
			this.dependencies.activeRuns.release(runId);
		}
	}

	private async settleCancelled(runId: AgentRunId): Promise<void> {
		const settled = await this.dependencies.runs.transition(runId, 'cancelling', 'cancelled', {
			finishedAt: now(),
			failure: 'The request was cancelled'
		});
		if (!settled) return;
		await this.append(runId, { type: 'cancelled', runId, message: 'Generation stopped' });
	}

	private async settleFailed(runId: AgentRunId, error: unknown): Promise<void> {
		const message = error instanceof Error ? error.message : String(error);
		try {
			const settled = await this.dependencies.runs.transition(runId, 'running', 'failed', {
				finishedAt: now(),
				failure: message
			});
			if (!settled) return;
			await this.append(runId, {
				type: 'failed',
				runId,
				code: 'WORKFLOW_FAILED',
				message,
				retryable: true
			});
		} catch (settlementError) {
			// Without a settled row the run holds its conversation's active slot and
			// keeps the client's event stream open forever.
			console.error(`[workflow-run] Could not settle failed run ${runId}:`, settlementError);
		}
	}

	private async append(runId: AgentRunId, event: AgentEvent) {
		const record = await this.dependencies.events.append(runId, 1, event);
		this.dependencies.eventBus.notify(runId);
		return record;
	}
}
