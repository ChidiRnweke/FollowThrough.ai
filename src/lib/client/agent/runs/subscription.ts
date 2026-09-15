import { readAgentRunEventRecord } from './event-reader';
import type { AgentRunTransport } from './contracts';

type SubscriptionInput = Parameters<AgentRunTransport['openEvents']>[0];
export interface RunEventSource {
	close(): void;
}
export type OpenRunEventSource = (input: {
	url: string;
	onOpen(): void;
	onFrame(frame: string): void;
	onError(): void;
}) => RunEventSource;

const openBrowserSource: OpenRunEventSource = (input) => {
	const source = new EventSource(input.url);
	source.onopen = input.onOpen;
	source.addEventListener('agent', (event) => input.onFrame(event.data));
	source.onerror = input.onError;
	return source;
};

/** Reconnect from the last handled event, including when an asynchronous handler fails. */
export class RunEventSubscription {
	private source?: RunEventSource;
	private cursor: string;
	private closed = false;
	private generation = 0;
	private queue = Promise.resolve();
	private retry?: ReturnType<typeof setTimeout>;
	constructor(
		private readonly input: SubscriptionInput,
		private readonly open: OpenRunEventSource = openBrowserSource
	) {
		this.cursor = input.after;
		this.connect();
	}
	close(): void {
		this.closed = true;
		this.generation += 1;
		this.source?.close();
		clearTimeout(this.retry);
	}
	private connect(): void {
		const generation = ++this.generation;
		this.source = this.open({
			url: `/api/agent/runs/${this.input.runId}/events?after=${encodeURIComponent(this.cursor)}`,
			onOpen: () => {
				if (!this.closed && generation === this.generation) this.input.onOpen();
			},
			onError: () => this.reconnect(generation),
			onFrame: (frame) => {
				this.queue = this.queue.then(async () => {
					if (this.closed || generation !== this.generation) return;
					const result = await this.consume(frame);
					if (result.kind === 'failure') this.reconnect(generation);
				});
			}
		});
	}
	private async consume(
		frame: string
	): Promise<{ kind: 'consumed' } | { kind: 'failure'; error: unknown }> {
		try {
			const value: unknown = JSON.parse(frame);
			const record = readAgentRunEventRecord(value);
			if (record.kind === 'invalid') throw new Error(record.reason);
			if (record.runId !== this.input.runId) throw new Error('Event belongs to a different run');
			if (BigInt(record.cursor) <= BigInt(this.cursor)) return { kind: 'consumed' } as const;
			await this.input.onEvent(record);
			this.cursor = record.cursor;
			return { kind: 'consumed' } as const;
		} catch (error) {
			return { kind: 'failure', error };
		}
	}
	private reconnect(generation: number): void {
		if (this.closed || generation !== this.generation) return;
		this.generation += 1;
		this.source?.close();
		this.input.onError();
		// Match EventSource's usual retry delay while resetting its receipt-based Last-Event-ID.
		this.retry = setTimeout(() => {
			if (!this.closed) this.connect();
		}, 3000);
	}
}
