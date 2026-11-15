import { logLevelEnabled } from '$lib/server/infrastructure/telemetry/tracing';

/**
 * A request refused before any controller runs is logged at debug, with its path and reason
 * and nothing from the request itself. Anyone can send these requests, so a line per refusal at
 * a production level would let request volume decide log volume; the edge counts and limits
 * them instead.
 */
export const logRefusal = (path: string, reason: string): void => {
	if (logLevelEnabled('debug')) console.debug('[refused]', { path, reason });
};
