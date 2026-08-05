import type { ActorContext } from '$lib/models/identity';
import type { AgentRunId, AgentRunReceipt, ConversationId } from '$lib/models/agent';
import type { WorkflowRunStarter, WorkflowRunTask } from '$lib/server/services/agent/runs/workflow';

/**
 * Starts note-action runs without a database or an event log.
 *
 * The work runs to completion inside `start` rather than in the background, so a
 * controller test can assert on what the action produced without waiting on a
 * stream. `abort()` cancels the signal every started task observes, which is how a
 * test reproduces the user pressing the cancel cross.
 */
export class InMemoryWorkflowRunner implements WorkflowRunStarter {
	readonly started: { action: string; runId: AgentRunId }[] = [];
	readonly results: unknown[] = [];
	readonly failures: unknown[] = [];
	private readonly controllers = new Map<AgentRunId, AbortController>();
	private sequence = 0;

	async start<Result>(
		_actor: ActorContext,
		task: WorkflowRunTask<Result>
	): Promise<AgentRunReceipt> {
		this.sequence += 1;
		const runId = `run-${this.sequence}` as AgentRunId;
		const controller = new AbortController();
		this.controllers.set(runId, controller);
		this.started.push({ action: task.action, runId });
		try {
			this.results.push(await task.run(controller.signal));
		} catch (error) {
			this.failures.push(error);
		}
		return {
			runId,
			conversationId: `conversation-${this.sequence}` as ConversationId,
			status: 'running',
			latestCursor: String(this.sequence)
		};
	}

	/** Cancels a started run the way `cancelAgentRun` does in production. */
	abort(runId: AgentRunId): void {
		this.controllers.get(runId)?.abort();
	}
}
