import type { AgentRunId } from '$lib/models/agent';

/** Process-owned cancellation handles. Durable run status remains in the repository. */
export class ActiveRunStore {
	private readonly handles = new Map<AgentRunId, AbortController>();

	get(runId: AgentRunId): AbortController | undefined {
		return this.handles.get(runId);
	}
	register(runId: AgentRunId, handle: AbortController): void {
		this.handles.set(runId, handle);
	}
	/** A previous execution must not remove a resumed execution's handle. */
	release(runId: AgentRunId, handle: AbortController): void {
		if (this.handles.get(runId) === handle) this.handles.delete(runId);
	}
}

/** Chat and note-action executions share one registry for this process's lifetime. */
export const activeRunStore = new ActiveRunStore();
