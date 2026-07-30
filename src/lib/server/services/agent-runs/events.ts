import { EventEmitter } from 'node:events';
import type { AgentRunId } from '$lib/models';

export interface AgentEventBus {
	notify(runId: AgentRunId): void;
	subscribe(runId: AgentRunId, listener: () => void): () => void;
}

export class AgentEvents implements AgentEventBus {
	private readonly emitter = new EventEmitter();

	constructor() {
		this.emitter.setMaxListeners(0);
	}

	notify(runId: AgentRunId): void {
		this.emitter.emit(runId);
	}

	subscribe(runId: AgentRunId, listener: () => void): () => void {
		this.emitter.on(runId, listener);
		return () => {
			this.emitter.off(runId, listener);
		};
	}
}
