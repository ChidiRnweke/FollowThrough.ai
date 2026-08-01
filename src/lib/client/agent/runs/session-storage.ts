import type { AgentRunClientStorage, StoredAgentRunClientState } from './contracts';

const KEY = 'followthrough.agent.active-run';

export class SessionAgentRunStorage implements AgentRunClientStorage {
	load(): StoredAgentRunClientState {
		if (typeof sessionStorage === 'undefined') return { cursor: '0', attempt: 0 };
		try {
			return JSON.parse(
				sessionStorage.getItem(KEY) ?? '{"cursor":"0","attempt":0}'
			) as StoredAgentRunClientState;
		} catch {
			return { cursor: '0', attempt: 0 };
		}
	}

	save(state: StoredAgentRunClientState): void {
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(state));
	}

	clear(): void {
		if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY);
	}
}
