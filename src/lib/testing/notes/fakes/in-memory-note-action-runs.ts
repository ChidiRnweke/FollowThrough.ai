import type { AgentEvent, AgentRunEventRecord, AgentRunId } from '$lib/models/agent';

interface EventStream {
	close(): void;
}

interface OpenStream {
	readonly runId: AgentRunId;
	readonly after: string;
	readonly deliver: (record: AgentRunEventRecord) => void;
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
	private readonly log = new Map<AgentRunId, AgentRunEventRecord[]>();
	private sequence = 0;

	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: AgentRunEventRecord) => void,
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

	async cancel(runId: AgentRunId): Promise<unknown> {
		this.cancelled.push(runId);
		return undefined;
	}

	/** Records an event and pushes it to every stream still open on that run. */
	emit(runId: AgentRunId, event: AgentEvent): AgentRunEventRecord {
		this.sequence += 1;
		const record: AgentRunEventRecord = {
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
	private records: readonly unknown[] = [];

	load(): readonly never[] {
		return this.records as readonly never[];
	}

	save(runs: readonly unknown[]): void {
		this.records = runs;
	}
}
