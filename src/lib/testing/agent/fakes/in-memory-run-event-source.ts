import type { OpenRunEventSource } from '$lib/client/agent/runs/subscription';
import type { AgentRunEventRecord } from '$lib/models/agent';

export class InMemoryRunEventSource {
	readonly connections: { input: Parameters<OpenRunEventSource>[0]; closed: boolean }[] = [];
	readonly open: OpenRunEventSource = (input) => {
		const connection = { input, closed: false };
		this.connections.push(connection);
		return {
			close: () => {
				connection.closed = true;
			}
		};
	};
	emit(record: AgentRunEventRecord): void {
		for (const connection of this.connections)
			if (!connection.closed) connection.input.onFrame(JSON.stringify(record));
	}
	disconnect(): void {
		for (const connection of this.connections) if (!connection.closed) connection.input.onError();
	}
}
