import { NoteActionEventReader } from '$lib/client/notes/action-event-reader';
import type { NoteActionEventRecord } from '$lib/models/note-actions';
import type {
	NoteActionRunTransport,
	NoteActionRunStorage,
	NoteActionReviewTransport
} from '$lib/models/browser-workspace';
import type {
	AgentEvent,
	StoredAgentRunEventRecord,
	AgentRunId,
	StoredNoteActionRun
} from '$lib/models/agent';

interface EventStream {
	close(): void;
}

interface OpenStream {
	readonly runId: AgentRunId;
	readonly after: string;
	readonly deliver: (record: NoteActionEventRecord) => void | Promise<void>;
	closed: boolean;
}

/**
 * Stands in for the SSE connection to `/api/agent/runs/[runId]/events`.
 *
 * Events are held per run with their cursors, so reopening a stream replays only
 * what follows the cursor the client reconnects with — the behaviour a refresh
 * depends on.
 */
export class InMemoryNoteActionRunTransport implements NoteActionRunTransport {
	private readonly reader = new NoteActionEventReader();
	private pending: Promise<void>[] = [];
	cancellationFailure: Error | null = null;
	async flush(): Promise<void> {
		await Promise.all(this.pending.splice(0));
	}
	readonly cancelled: AgentRunId[] = [];
	readonly streams: OpenStream[] = [];
	private readonly log = new Map<AgentRunId, StoredAgentRunEventRecord[]>();
	private sequence = 0;

	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: NoteActionEventRecord) => void | Promise<void>
	): EventStream {
		const stream: OpenStream = { runId, after, deliver: onEvent, closed: false };
		this.streams.push(stream);
		for (const record of this.log.get(runId) ?? []) {
			if (record.cursor > after)
				this.pending.push(Promise.resolve(onEvent(this.reader.read(record))));
		}
		return {
			close: () => {
				stream.closed = true;
			}
		};
	}

	async cancel(runId: AgentRunId): Promise<void> {
		if (this.cancellationFailure) throw this.cancellationFailure;
		this.cancelled.push(runId);
		return undefined;
	}

	/** Records an event and pushes it to every stream still open on that run. */
	emit(runId: AgentRunId, event: AgentEvent): StoredAgentRunEventRecord {
		this.sequence += 1;
		const record: StoredAgentRunEventRecord = {
			kind: 'readable',
			cursor: String(this.sequence).padStart(6, '0'),
			runId,
			attempt: 1,
			event,
			createdAt: new Date(0)
		};
		this.log.set(runId, [...(this.log.get(runId) ?? []), record]);
		for (const stream of this.streams)
			if (stream.runId === runId && !stream.closed)
				this.pending.push(Promise.resolve(stream.deliver(this.reader.read(record))));
		return record;
	}

	get openStreams(): readonly OpenStream[] {
		return this.streams.filter((stream) => !stream.closed);
	}
}

/** Session storage without a browser, and shareable across two stores to model a refresh. */
export class InMemoryNoteActionRunStorage implements NoteActionRunStorage {
	saveFailure: Error | null = null;
	private records: readonly StoredNoteActionRun[] = [];

	load(): readonly StoredNoteActionRun[] {
		return this.records;
	}

	save(runs: readonly StoredNoteActionRun[]): void {
		if (this.saveFailure) throw this.saveFailure;
		this.records = runs;
	}
}

export class InMemoryNoteActionReview implements NoteActionReviewTransport {
	readonly accepted: import('$lib/models/suggestions').SuggestionId[] = [];
	failure: Error | null = null;
	private gate: { started(): void; ready: Promise<void> } | null = null;
	pause() {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	async accept(suggestionId: import('$lib/models/suggestions').SuggestionId): Promise<void> {
		const gate = this.gate;
		this.gate = null;
		if (gate) {
			gate.started();
			await gate.ready;
		}
		if (this.failure) throw this.failure;
		this.accepted.push(suggestionId);
	}
}
