import { NotFoundError } from '$lib/errors';
import type {
	AgentEvent,
	AgentRunId,
	AgentRunStatus,
	StoredAgentRunEventRecord
} from '$lib/models/agent';
import type { AgentHarness } from '$lib/server/controllers/agent/controller';
import { AgentRunStatusService } from '$lib/services/agent/run-status';

/**
 * One run's event log as the agent harness exposes it to an event stream: change signals, replay
 * from a cursor, and the completion rule. It records the subscriptions still open and how far
 * readers have taken events out of the log.
 */
export class InMemoryRunEventFeed implements Pick<
	AgentHarness,
	'observeRun' | 'listRunEvents' | 'isRunStreamComplete'
> {
	private readonly records: StoredAgentRunEventRecord[] = [];
	private readonly listeners = new Set<() => void>();
	private readonly rules = new AgentRunStatusService();
	private status: AgentRunStatus = 'running';
	/** The cursor of the newest event a replay has handed out. */
	readThrough = '0';

	constructor(private readonly runId: AgentRunId) {}

	get subscriptions(): number {
		return this.listeners.size;
	}

	append(event: AgentEvent): void {
		this.records.push({
			kind: 'readable',
			cursor: String(this.records.length + 1),
			runId: this.runId,
			attempt: 1,
			event,
			createdAt: new Date('2026-01-01T00:00:00.000Z')
		});
		this.changed();
	}

	settle(status: AgentRunStatus): void {
		this.status = status;
		this.changed();
	}

	async observeRun(runId: AgentRunId, listener: () => void): Promise<() => Promise<void>> {
		this.require(runId);
		this.listeners.add(listener);
		return async () => {
			this.listeners.delete(listener);
		};
	}

	async listRunEvents(
		runId: AgentRunId,
		after: string
	): Promise<readonly StoredAgentRunEventRecord[]> {
		this.require(runId);
		const records = this.records.filter((record) => BigInt(record.cursor) > BigInt(after));
		this.readThrough = records.at(-1)?.cursor ?? this.readThrough;
		return records;
	}

	async isRunStreamComplete(runId: AgentRunId, deliveredCursor: string): Promise<boolean> {
		this.require(runId);
		const latest = this.records.at(-1)?.cursor ?? '0';
		return this.rules.eventStreamComplete(this.status, deliveredCursor, latest);
	}

	private require(runId: AgentRunId): void {
		if (runId !== this.runId) throw new NotFoundError('Agent run was not found');
	}

	/** Like the Postgres notification, a change reaches listeners after the writer continues. */
	private changed(): void {
		for (const listener of this.listeners) queueMicrotask(listener);
	}
}
