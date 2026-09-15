import type { AgentRunTransport } from '$lib/client/agent/runs/contracts';
import type {
	AgentRunReceipt,
	AgentRunSnapshot,
	StoredAgentRunEventRecord
} from '$lib/models/agent';

/** A connected replay whose frames can be delivered again after a consumer failure. */
export class InMemoryRunTransport implements AgentRunTransport {
	snapshot?: AgentRunSnapshot;
	private connection?: Parameters<AgentRunTransport['openEvents']>[0];
	constructor(readonly receipt: AgentRunReceipt) {}
	async submit(): Promise<AgentRunReceipt> {
		return this.receipt;
	}
	async get(): Promise<AgentRunSnapshot> {
		if (!this.snapshot) throw new Error('No run snapshot supplied');
		return this.snapshot;
	}
	async decideMany(): Promise<AgentRunSnapshot> {
		throw new Error('No approval pending');
	}
	async cancel(): Promise<AgentRunSnapshot> {
		throw new Error('Cancellation unavailable');
	}
	async retry(): Promise<AgentRunReceipt> {
		throw new Error('Retry unavailable');
	}
	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		this.connection = input;
		input.onOpen();
		return {
			close: () => {
				this.connection = undefined;
			}
		};
	}
	async deliver(record: StoredAgentRunEventRecord): Promise<void> {
		if (!this.connection) throw new Error('No replay connection');
		await this.connection.onEvent(record);
	}
	disconnect(): void {
		this.connection?.onError();
	}
}
