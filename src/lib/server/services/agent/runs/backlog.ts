import type {
	InterruptedRun,
	NoteActionRunContext,
	OwnedRun,
	RunExecutor
} from '$lib/models/agent';
import type { AgentRunBacklogRepository } from '$lib/server/repositories/agent';

/** The runs a restarted process must settle or resume, across every user. */
export interface RunBacklog {
	/** The runs this kind of process was executing when it stopped (ADR 0052). */
	interrupted(): Promise<readonly InterruptedRun[]>;
	queuedAgentRuns(): Promise<readonly OwnedRun[]>;
	queuedWorkflowRuns(kind: NoteActionRunContext['kind']): Promise<readonly OwnedRun[]>;
}
export class RunBacklogService implements RunBacklog {
	constructor(
		private readonly runs: AgentRunBacklogRepository,
		private readonly executor: RunExecutor
	) {}
	async interrupted(): Promise<readonly InterruptedRun[]> {
		return (await this.runs.listInterrupted(this.executor)).map((run) => ({
			owner: { userId: run.userId },
			runId: run.id,
			status: run.status
		}));
	}
	async queuedAgentRuns(): Promise<readonly OwnedRun[]> {
		return (await this.runs.listQueuedAgents()).map((run) => ({
			owner: { userId: run.userId },
			runId: run.id
		}));
	}
	async queuedWorkflowRuns(kind: NoteActionRunContext['kind']): Promise<readonly OwnedRun[]> {
		return (await this.runs.listQueuedWorkflows()).flatMap((run) =>
			run.contextSnapshot.kind === kind ? [{ owner: { userId: run.userId }, runId: run.id }] : []
		);
	}
}
