import type { UserId } from '$lib/models/identity';
import type { ClientErrorReport } from '$lib/models/telemetry/client-error';

/**
 * One error line per admitted browser report. `scripts/otel-instrumentation.js` bridges
 * `console.*` into the OTel logs pipeline, so this reaches the collector with no exporter of
 * its own. `suppressed=n` says how many repeats were dropped since the user's previous line.
 */
export const writeClientErrorLog = (
	userId: UserId,
	report: ClientErrorReport,
	suppressed: number
): void => {
	const where = report.route ?? report.pathname ?? 'unknown route';
	console.error(
		`[client] ${report.message} (${where}${report.status ? ` status=${report.status}` : ''} user=${userId}${
			suppressed > 0 ? ` suppressed=${suppressed}` : ''
		})${report.stack ? `\n${report.stack}` : ''}`
	);
};
