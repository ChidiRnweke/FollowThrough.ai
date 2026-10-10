import type { AgentRunId, NoteActionContext } from '$lib/models/agent';
import type {
	NoteActionRun,
	NoteActionRunState,
	NoteActionOutcome,
	NoteActionEventStream
} from '$lib/models/browser-workspace';

/** State belongs to one mounted editor. No storage or event work happens here. */
export class NoteActionRunStore implements NoteActionRunState {
	private entries = $state<readonly NoteActionRun[]>([]);
	private closed = $state(false);
	/* eslint-disable svelte/prefer-svelte-reactivity -- internal continuation ownership; only entries and closed are observed. */
	private readonly streams = new Map<AgentRunId, NoteActionEventStream>();
	private readonly inserted = new Set<AgentRunId>();
	private readonly waiters = new Map<
		AgentRunId,
		readonly ((outcome: NoteActionOutcome) => void)[]
	>();
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
	setDelivery(runId: AgentRunId, delivery: 'inserted'): void {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, delivery } : entry
		);
	}
	hasInserted(runId: AgentRunId): boolean {
		return this.inserted.has(runId);
	}
	markInserted(runId: AgentRunId): void {
		this.inserted.add(runId);
	}
	setWaiter(runId: AgentRunId, waiter: (outcome: NoteActionOutcome) => void): void {
		this.waiters.set(runId, [...(this.waiters.get(runId) ?? []), waiter]);
	}
	takeWaiters(runId: AgentRunId): readonly ((outcome: NoteActionOutcome) => void)[] {
		const waiters = this.waiters.get(runId) ?? [];
		this.waiters.delete(runId);
		this.inserted.delete(runId);
		return waiters;
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
		this.inserted.clear();
		this.waiters.clear();
		this.entries = [];
		return streams;
	}
}
