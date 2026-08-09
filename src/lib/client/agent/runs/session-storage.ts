import type { AgentRunClientStorage, StoredAgentRunClientState } from './contracts';

const KEY_PREFIX = 'followthrough.agent.active-run';

/**
 * The resume point for one chat session's run.
 *
 * The key is per session rather than global: several conversations stream at
 * once, and a single slot meant the last one to save clobbered the cursors the
 * others needed to resume from after a reload.
 */
export class SessionAgentRunStorage implements AgentRunClientStorage {
	private readonly key: string;

	constructor(sessionKey?: string) {
		this.key = sessionKey === undefined ? KEY_PREFIX : `${KEY_PREFIX}.${sessionKey}`;
	}

	load(): StoredAgentRunClientState {
		if (typeof sessionStorage === 'undefined') return { cursor: '0', attempt: 0 };
		try {
			return JSON.parse(
				sessionStorage.getItem(this.key) ?? '{"cursor":"0","attempt":0}'
			) as StoredAgentRunClientState;
		} catch {
			return { cursor: '0', attempt: 0 };
		}
	}

	save(state: StoredAgentRunClientState): void {
		if (typeof sessionStorage !== 'undefined')
			sessionStorage.setItem(this.key, JSON.stringify(state));
	}

	clear(): void {
		if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(this.key);
	}
}
