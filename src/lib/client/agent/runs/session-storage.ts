import type {
	AgentRunClientStorage,
	StoredAgentRunClientState,
	StoredAgentRunClientStateResult
} from './contracts';
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

export const readStoredAgentRunState = (value: string | null): StoredAgentRunClientStateResult => {
	if (value === null) return { kind: 'missing' };
	try {
		return { kind: 'valid', state: parseStoredState(value) };
	} catch (error) {
		return {
			kind: 'corrupt',
			message: error instanceof Error ? error.message : 'Saved run state is unreadable'
		};
	}
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

	load(): StoredAgentRunClientStateResult {
		if (typeof sessionStorage === 'undefined') return { kind: 'missing' };
		return readStoredAgentRunState(sessionStorage.getItem(this.key));
	}

	save(state: StoredAgentRunClientState): void {
		if (typeof sessionStorage !== 'undefined')
			sessionStorage.setItem(this.key, JSON.stringify(state));
	}

	clear(): void {
		if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(this.key);
	}
}
