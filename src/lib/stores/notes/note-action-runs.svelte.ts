import type { AgentRunId, NoteActionKind, NoteActionContext } from '$lib/models/agent';
import type {
	NoteActionRun,
	NoteActionHandler,
	NoteActionOutcome,
	NoteActionEventStream
} from '$lib/controllers/notes/action-runs';

/** State belongs to one mounted editor. No storage or event work happens here. */
export class NoteActionRunStore {
	private entries = $state<readonly NoteActionRun[]>([]);
	private closed = $state(false);
	/* eslint-disable svelte/prefer-svelte-reactivity -- internal continuation ownership; only entries and closed are observed. */
	private readonly streams = new Map<AgentRunId, NoteActionEventStream>();
	private readonly handlers = new Map<NoteActionKind, NoteActionHandler>();
	private readonly waiters = new Map<AgentRunId, (outcome: NoteActionOutcome) => void>();
	/* eslint-enable svelte/prefer-svelte-reactivity */
	get running(): readonly NoteActionRun[] {
		return this.entries;
	}
	get detached(): boolean {
		return this.closed;
	}
	replace(entries: readonly NoteActionRun[]): void {
		this.entries = entries;
	}
	setCancelling(runId: AgentRunId, cancelling: boolean): void {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, cancelling } : entry
		);
	}
	setContext(runId: AgentRunId, context: NoteActionContext): void {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, context } : entry
		);
	}
	setCursor(runId: AgentRunId, cursor: string): void {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, cursor } : entry
		);
	}
	setHandler(action: NoteActionKind, handler: NoteActionHandler): void {
		this.handlers.set(action, handler);
	}
	handler(action: NoteActionKind): NoteActionHandler | undefined {
		return this.handlers.get(action);
	}
	setWaiter(runId: AgentRunId, waiter: (outcome: NoteActionOutcome) => void): void {
		this.waiters.set(runId, waiter);
	}
	takeWaiter(runId: AgentRunId): ((outcome: NoteActionOutcome) => void) | undefined {
		const waiter = this.waiters.get(runId);
		this.waiters.delete(runId);
		return waiter;
	}
	setStream(runId: AgentRunId, stream: NoteActionEventStream): void {
		this.streams.set(runId, stream);
	}
	takeStream(runId: AgentRunId): NoteActionEventStream | undefined {
		const stream = this.streams.get(runId);
		this.streams.delete(runId);
		return stream;
	}
	close(): readonly NoteActionEventStream[] {
		const streams = [...this.streams.values()];
		this.closed = true;
		this.streams.clear();
		this.handlers.clear();
		this.waiters.clear();
		this.entries = [];
		return streams;
	}
}
