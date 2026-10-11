import type { InterruptedRun, NoteActionRunContext, OwnedRun } from '$lib/models/agent';
import type { AgentRunBacklogRepository } from '$lib/server/repositories/agent';

/** The runs a restarted process must settle or resume, across every user. */
export interface RunBacklog {
	interrupted(): Promise<readonly InterruptedRun[]>;
	queuedAgentRuns(): Promise<readonly OwnedRun[]>;
	queuedWorkflowRuns(kind: NoteActionRunContext['kind']): Promise<readonly OwnedRun[]>;
}
export class RunBacklogService implements RunBacklog {
	constructor(private readonly runs: AgentRunBacklogRepository) {}
	async interrupted(): Promise<readonly InterruptedRun[]> {
		return (await this.runs.listInterrupted()).map((run) => ({
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
