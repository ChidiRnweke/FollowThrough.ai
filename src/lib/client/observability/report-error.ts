import { browser } from '$app/env';
import { CLIENT_ERROR_LIMITS, type ClientErrorReport } from '$lib/models/telemetry/client-error';

/** Keeps a render loop that throws every frame from flooding the collector. */
const MAX_REPORTS_PER_PAGE = 20;
const seen = new Set<string>();
let sent = 0;

/**
 * Flattens an error and its `cause` chain into one line. Mirrors `describeError`
 * in `$lib/server/http-errors`, which cannot be imported here: Kit refuses
 * `$lib/server/*` in browser code.
 */
export function describeClientError(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;
	const visited = new Set<object>();
	while (current !== undefined && current !== null) {
		if (typeof current === 'object') {
			if (visited.has(current)) break;
			visited.add(current);
		}
		if (current instanceof Error) {
			parts.push(`${current.name}: ${current.message}`);
			current = current.cause;
		} else {
			parts.push(String(current));
			break;
		}
	}
	return parts.join(' <- ');
}

/**
 * Fire-and-forget. The server side of this is a `console.error`, which the OTel
 * console bridge in `scripts/otel-instrumentation.js` already ships to the
 * collector — so nothing here needs an exporter of its own.
 *
 * Never throws and never awaits: it is called from `handleError`, which must not
 * fail, and from render paths that are already in trouble.
 */
export function reportClientError(report: ClientErrorReport): void {
	if (!browser) return;
	if (sent >= MAX_REPORTS_PER_PAGE) return;

	const fingerprint = `${report.message}\u0000${report.stack ?? ''}`;
	if (seen.has(fingerprint)) return;
	seen.add(fingerprint);
	sent += 1;

	try {
		// chisel-ignore fail-loudly:silent-catch -- this terminal error reporter cannot recursively report its own transport failure
		void fetch('/api/client-errors', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: serializeClientErrorReport(report),
			// The page may be navigating away from the very error being reported.
			keepalive: true
		}).catch(() => {});
		// chisel-ignore fail-loudly:silent-catch -- this terminal error reporter cannot recursively report serialization failure
	} catch {
		// Reporting a failure must never become a second failure.
	}
}

/** Serialize the browser report sent to the ingestion boundary. */
export function serializeClientErrorReport(report: ClientErrorReport): string {
	const shorten = (value: string, limit: number): string => {
		const marker = ' [truncated]';
		return value.length <= limit ? value : value.slice(0, limit - marker.length) + marker;
	};
	return JSON.stringify({
		...report,
		message: shorten(report.message, CLIENT_ERROR_LIMITS.message),
		...(report.stack === undefined
			? {}
			: { stack: shorten(report.stack, CLIENT_ERROR_LIMITS.stack) }),
		...(report.route === undefined
			? {}
			: { route: shorten(report.route, CLIENT_ERROR_LIMITS.route) }),
		...(report.pathname === undefined
			? {}
			: { pathname: shorten(report.pathname, CLIENT_ERROR_LIMITS.pathname) })
	});
}
