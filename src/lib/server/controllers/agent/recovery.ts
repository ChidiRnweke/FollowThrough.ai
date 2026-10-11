import type { NoteActionRunContext } from '$lib/models/agent';
import type { InterruptedRun, OwnedRun, RunBacklog } from '$lib/server/services/agent/runs/backlog';

/**
 * The runs a restarted process must settle or resume. Recovery acts for each run's owner, so
 * the caller hands every listed run to that owner's agent or workflow controller.
 */
export interface RunRecoveryController {
	interrupted(): Promise<readonly InterruptedRun[]>;
	queuedAgentRuns(): Promise<readonly OwnedRun[]>;
	queuedWorkflowRuns(kind: NoteActionRunContext['kind']): Promise<readonly OwnedRun[]>;
}
export class RunRecovery implements RunRecoveryController {
	constructor(private readonly backlog: RunBacklog) {}
	interrupted() {
		return this.backlog.interrupted();
	}
	queuedAgentRuns() {
		return this.backlog.queuedAgentRuns();
	}
	queuedWorkflowRuns(kind: NoteActionRunContext['kind']) {
		return this.backlog.queuedWorkflowRuns(kind);
	}
}
