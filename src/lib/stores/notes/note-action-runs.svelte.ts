import type { AgentRunEventRecord, AgentRunId, NoteActionKind } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';

const KEY = 'followthrough.notes.active-actions';

/** Whatever the completion handler needs that the result itself does not carry. */
export type NoteActionContext = Readonly<Record<string, unknown>>;

interface StoredRun {
	readonly runId: AgentRunId;
	readonly action: NoteActionKind;
	readonly noteId: NoteId;
	/** Last event consumed, so a reattach replays only what this client missed. */
	readonly cursor: string;
	readonly context: NoteActionContext;
}

export interface NoteActionRun extends StoredRun {
	readonly cancelling: boolean;
}

/** Applies a finished action. Called on live completion and on post-refresh replay alike. */
export type NoteActionHandler = (result: unknown, context: NoteActionContext) => void | Promise<void>;

export interface NoteActionOutcome {
	readonly status: 'completed' | 'cancelled' | 'failed';
	readonly result?: unknown;
	readonly message?: string;
}

interface EventStream {
	close(): void;
}

interface NoteActionRunTransport {
	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: AgentRunEventRecord) => void,
		onError: () => void
	): EventStream;
	cancel(runId: AgentRunId): Promise<unknown>;
}

class BrowserTransport implements NoteActionRunTransport {
	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: AgentRunEventRecord) => void,
		onError: () => void
	): EventStream {
		const source = new EventSource(
			`/api/agent/runs/${runId}/events?after=${encodeURIComponent(after)}`
		);
		source.addEventListener('agent', (event) => {
			const parsed = JSON.parse((event as MessageEvent<string>).data) as Omit<
				AgentRunEventRecord,
				'createdAt'
			> & { createdAt: string };
			onEvent({ ...parsed, createdAt: new Date(parsed.createdAt) });
		});
		source.onerror = onError;
		return { close: () => source.close() };
	}

	async cancel(runId: AgentRunId): Promise<unknown> {
		const { cancelAgentRun } = await import('$lib/remote/agent/chat.remote');
		return cancelAgentRun({ runId } as never);
	}
}

interface RunStorage {
	load(): readonly StoredRun[];
	save(runs: readonly StoredRun[]): void;
}

class SessionRunStorage implements RunStorage {
	load(): readonly StoredRun[] {
		if (typeof sessionStorage === 'undefined') return [];
		try {
			const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown;
			return Array.isArray(parsed) ? (parsed as StoredRun[]) : [];
		} catch {
			return [];
		}
	}

	save(runs: readonly StoredRun[]): void {
		if (typeof sessionStorage === 'undefined') return;
		if (runs.length === 0) sessionStorage.removeItem(KEY);
		else sessionStorage.setItem(KEY, JSON.stringify(runs));
	}
}

/**
 * Tracks the note editor's AI actions while they run on the server.
 *
 * The actions are agent runs now, not awaited requests, which is what lets the
 * cancel cross stop one and a refresh pick one back up. This store owns both
 * halves: it keeps each run's id and event cursor in session storage, and it
 * turns the run's event stream back into the single result the editor wants.
 *
 * Completion is delivered through registered handlers rather than the promise
 * `start` returns, because after a refresh there is no promise left to resolve —
 * the same handler has to serve the live path and the replay.
 */
export class NoteActionRunsStore {
	private entries = $state<NoteActionRun[]>([]);
	private readonly streams = new Map<AgentRunId, EventStream>();
	private readonly handlers = new Map<NoteActionKind, NoteActionHandler>();
	private readonly waiters = new Map<AgentRunId, (outcome: NoteActionOutcome) => void>();

	constructor(
		/** One store per note: a split pane must never show its sibling's work. */
		private readonly noteId: NoteId,
		private readonly transport: NoteActionRunTransport = new BrowserTransport(),
		private readonly storage: RunStorage = new SessionRunStorage()
	) {}

	/** Every run currently in flight, for the progress rows to render. */
	get running(): readonly NoteActionRun[] {
		return this.entries;
	}

	/** The selection action occupying the bubble menu, if any. */
	get activeSelectionAction(): NoteActionRun | undefined {
		return this.entries.find((entry) => entry.action !== 'revise' && entry.action !== 'convert');
	}

	find(action: NoteActionKind): NoteActionRun | undefined {
		return this.entries.find((entry) => entry.action === action);
	}

	/** Registers what to do with an action's result, whenever and however it arrives. */
	on(action: NoteActionKind, handler: NoteActionHandler): void {
		this.handlers.set(action, handler);
	}

	/**
	 * Tracks a run the server has just accepted and resolves once it settles.
	 *
	 * The returned promise is a convenience for the caller that started the run;
	 * the registered handler is what actually applies the result, so the outcome is
	 * identical whether the caller is still there to await it or not.
	 */
	track(
		receipt: { readonly runId: AgentRunId; readonly latestCursor: string },
		run: { readonly action: NoteActionKind; readonly context?: NoteActionContext }
	): Promise<NoteActionOutcome> {
		const entry: NoteActionRun = {
			runId: receipt.runId,
			action: run.action,
			noteId: this.noteId,
			cursor: receipt.latestCursor,
			context: run.context ?? {},
			cancelling: false
		};
		this.entries = [...this.entries, entry];
		this.persist();
		const settled = new Promise<NoteActionOutcome>((resolve) => {
			this.waiters.set(entry.runId, resolve);
		});
		this.attach(entry);
		return settled;
	}

	/** Re-attaches every run this tab left in flight. Call once the handlers are registered. */
	hydrate(): void {
		this.entries = this.storage
			.load()
			.filter((run) => run.noteId === this.noteId)
			.map((run) => ({ ...run, cancelling: false }));
		for (const entry of this.entries) this.attach(entry);
	}

	/** Stops a run and its billing. The server settles it; the stream reports back. */
	async cancel(runId: AgentRunId): Promise<void> {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, cancelling: true } : entry
		);
		try {
			await this.transport.cancel(runId);
		} catch {
			// The run may have settled between the click and the request; the stream
			// carries the truth either way, so there is nothing to report here.
		}
	}

	/** Drops every stream without settling the runs, for component teardown. */
	detach(): void {
		for (const stream of this.streams.values()) stream.close();
		this.streams.clear();
	}

	private attach(entry: NoteActionRun): void {
		this.streams.get(entry.runId)?.close();
		const stream = this.transport.open(
			entry.runId,
			entry.cursor,
			(record) => void this.consume(entry.runId, record),
			() => {
				// EventSource reconnects on its own; a closed stream on a settled run is
				// expected, and an unsettled one resumes from the persisted cursor.
			}
		);
		this.streams.set(entry.runId, stream);
	}

	private async consume(runId: AgentRunId, record: AgentRunEventRecord): Promise<void> {
		this.advance(runId, record.cursor);
		const event = record.event;
		if (event.type === 'workflow_result') {
			const entry = this.entries.find((candidate) => candidate.runId === runId);
			const handler = this.handlers.get(event.action);
			if (handler) await handler(event.result, entry?.context ?? {});
			this.settle(runId, { status: 'completed', result: event.result });
			return;
		}
		if (event.type === 'cancelled') this.settle(runId, { status: 'cancelled' });
		if (event.type === 'failed') this.settle(runId, { status: 'failed', message: event.message });
	}

	private advance(runId: AgentRunId, cursor: string): void {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, cursor } : entry
		);
		this.persist();
	}

	private settle(runId: AgentRunId, outcome: NoteActionOutcome): void {
		this.streams.get(runId)?.close();
		this.streams.delete(runId);
		this.entries = this.entries.filter((entry) => entry.runId !== runId);
		this.persist();
		this.waiters.get(runId)?.(outcome);
		this.waiters.delete(runId);
	}

	private persist(): void {
		// Runs for other notes stay parked rather than being dropped: navigating back
		// to that note should still find its work in flight.
		const foreign = this.storage.load().filter((run) => run.noteId !== this.noteId);
		this.storage.save([
			...foreign,
			...this.entries.map(({ cancelling: _cancelling, ...run }) => run)
		]);
	}
}

const stores = new Map<NoteId, NoteActionRunsStore>();

/** One store per note id, so a split pane's two editors never share run state. */
export const noteActionRunsFor = (noteId: NoteId): NoteActionRunsStore => {
	const existing = stores.get(noteId);
	if (existing) return existing;
	const created = new NoteActionRunsStore(noteId);
	stores.set(noteId, created);
	return created;
};
