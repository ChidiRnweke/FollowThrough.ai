import type { Route } from '@playwright/test';
import type { Json } from '../capture-screenshots/journal.ts';

/**
 * Encode a value the way SvelteKit's remote `command` answers: devalue's flat node list under a
 * `result` envelope. The same encoder drives the fake agent runs in `tests/agent-workbench.e2e.ts`.
 */
export const remoteResult = (value: Json): string => {
	const nodes: Json[] = [];
	const flatten = (item: Json): number => {
		const index = nodes.length;
		nodes.push(null);
		if (Array.isArray(item)) nodes[index] = item.map(flatten);
		else if (item !== null && typeof item === 'object')
			nodes[index] = Object.fromEntries(
				Object.entries(item).map(([key, child]) => [key, flatten(child)])
			);
		else nodes[index] = item;
		return index;
	};
	flatten({ _: value });
	return JSON.stringify({ type: 'result', data: JSON.stringify(nodes) });
};

/** Answer a routed remote command with a value. */
export const fulfillRemote = (route: Route, value: Json): Promise<void> =>
	route.fulfill({ contentType: 'application/json', body: remoteResult(value) });

/** The run snapshot `decideAgentRunBatch` answers with once the run is going again. */
export const runningSnapshot = (run: {
	readonly runId: string;
	readonly userId: string;
	readonly conversationId: string;
	readonly model: string;
	readonly prompt: string;
	readonly latestCursor: string;
}): Json => {
	const timestamp = new Date().toISOString();
	return {
		run: {
			id: run.runId,
			userId: run.userId,
			conversationId: run.conversationId,
			requestId: run.runId,
			model: run.model,
			executionMode: 'approval_required',
			status: 'running',
			attemptCount: 2,
			maxAttempts: 3,
			nextAttemptAt: timestamp,
			pendingDecisions: [],
			inputSnapshot: { prompt: run.prompt },
			contextSnapshot: {},
			createdAt: timestamp,
			updatedAt: timestamp
		},
		latestCursor: run.latestCursor,
		pendingDecisions: [],
		retryMayRepeatSideEffects: false
	};
};
