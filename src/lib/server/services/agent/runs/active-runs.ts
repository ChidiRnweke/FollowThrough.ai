import type { AgentRunId } from '$lib/models/agent';

/**
 * The in-process handles for runs currently executing here.
 *
 * Cancellation is durable in the database, but stopping the work itself needs
 * the `AbortController` the execution was started with, and that only exists in
 * the process that started it. Chat runs and note-action workflow runs both
 * register here so one cancel path settles either kind; a run whose process has
 * since restarted simply is not found, and the caller falls back to settling the
 * row on its own.
 */
const controllers = new Map<AgentRunId, AbortController>();

/** Claims the slot for `runId` and returns the controller its execution must observe. */
export const registerActiveRun = (runId: AgentRunId): AbortController => {
	const controller = new AbortController();
	controllers.set(runId, controller);
	return controller;
};

/** Aborts `runId` if it is executing here. Returns whether there was anything to abort. */
export const abortActiveRun = (runId: AgentRunId): boolean => {
	const controller = controllers.get(runId);
	if (!controller) return false;
	controller.abort();
	return true;
};

/** Drops the slot for `runId`, whatever its outcome was. Safe to call twice. */
export const releaseActiveRun = (runId: AgentRunId): void => {
	controllers.delete(runId);
};
