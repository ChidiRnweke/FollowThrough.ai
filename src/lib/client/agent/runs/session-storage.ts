import type { AgentRunClientStorage, StoredAgentRunClientState } from './contracts';
import type { AgentRunId } from '$lib/models/agent';
import { z } from 'zod';

const KEY_PREFIX = 'followthrough.agent.active-run';
const storedAgentRunClientStateSchema = z.object({
	runId: z.string().min(1).optional(),
	cursor: z.string(),
	attempt: z.number().int().nonnegative(),
	pendingRequestId: z.string().min(1).optional()
});

const parseStoredState = (value: string): StoredAgentRunClientState => {
	const parsed = storedAgentRunClientStateSchema.parse(JSON.parse(value));
	return {
		...(parsed.runId ? { runId: parsed.runId as AgentRunId } : {}),
		cursor: parsed.cursor,
		attempt: parsed.attempt,
		...(parsed.pendingRequestId ? { pendingRequestId: parsed.pendingRequestId } : {})
	};
};

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
		const stored = sessionStorage.getItem(this.key);
		return stored === null ? { cursor: '0', attempt: 0 } : parseStoredState(stored);
	}

	save(state: StoredAgentRunClientState): void {
		if (typeof sessionStorage !== 'undefined')
			sessionStorage.setItem(this.key, JSON.stringify(state));
	}

	clear(): void {
		if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(this.key);
	}
}
