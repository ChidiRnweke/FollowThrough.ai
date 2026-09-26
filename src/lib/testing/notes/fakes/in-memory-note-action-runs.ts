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
	readonly deliver: (record: StoredAgentRunEventRecord) => void | Promise<void>;
	closed: boolean;
}

/**
 * Stands in for the SSE connection to `/api/agent/runs/[runId]/events`.
 *
 * Events are held per run with their cursors, so reopening a stream replays only
 * what follows the cursor the client reconnects with — the behaviour a refresh
 * depends on.
 */
export class InMemoryNoteActionRunTransport {
	readonly cancelled: AgentRunId[] = [];
	readonly streams: OpenStream[] = [];
	private readonly log = new Map<AgentRunId, StoredAgentRunEventRecord[]>();
	private sequence = 0;

	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: StoredAgentRunEventRecord) => void | Promise<void>,
		_onError: () => void
	): EventStream {
		const stream: OpenStream = { runId, after, deliver: onEvent, closed: false };
		this.streams.push(stream);
		for (const record of this.log.get(runId) ?? []) {
			if (record.cursor > after) onEvent(record);
		}
		return {
			close: () => {
				stream.closed = true;
			}
		};
	}

	async cancel(runId: AgentRunId): Promise<void> {
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
			if (stream.runId === runId && !stream.closed) stream.deliver(record);
		return record;
	}

	get openStreams(): readonly OpenStream[] {
		return this.streams.filter((stream) => !stream.closed);
	}
}

/** Session storage without a browser, and shareable across two stores to model a refresh. */
export class InMemoryNoteActionRunStorage {
	private records: readonly StoredNoteActionRun[] = [];

	load(): readonly StoredNoteActionRun[] {
		return this.records;
	}

	save(runs: readonly StoredNoteActionRun[]): void {
		this.records = runs;
	}
}
