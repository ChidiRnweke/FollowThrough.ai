import type {
	AgentRunClientStorage,
	StoredAgentRunClientState,
	StoredAgentRunClientStateResult
} from '$lib/controllers/agent/run-transport';

export class InMemoryRunClientStorage implements AgentRunClientStorage {
	state: StoredAgentRunClientStateResult = { kind: 'missing' };
	writable = true;
	load(): StoredAgentRunClientStateResult {
		return this.state;
	}
	save(state: StoredAgentRunClientState): void {
		if (!this.writable) throw new Error('Session storage unavailable');
		this.state = { kind: 'valid', state: structuredClone(state) };
	}
	clear(): void {
		this.state = { kind: 'missing' };
	}
}
