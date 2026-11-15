import type { ClientErrorAdmission, ClientErrorReport } from '$lib/models/telemetry/client-error';
import type { DateTime } from '$lib/models/workspace';
import type {
	ClientErrorFingerprint,
	ClientErrorReportRepository
} from '$lib/server/repositories/telemetry';

/** The message and the stack, joined by a NUL: the same key the browser drops repeats on per page. */
const fingerprint = (report: ClientErrorReport): ClientErrorFingerprint =>
	`${report.message}\u0000${report.stack ?? ''}` as ClientErrorFingerprint;

export interface ClientErrorBudgetLimits {
	readonly reportsPerWindow: number;
	readonly windowMs: number;
}

export interface ClientErrorBudget {
	/** Admits a report into the user's rolling budget, drops a repeat, or says when room frees up. */
	admit(report: ClientErrorReport, now: DateTime): Promise<ClientErrorAdmission>;
}

/**
 * Browser error reports are capped per user per rolling window, across every server process,
 * and a report already admitted in the window is dropped as a repeat.
 */
export class ClientErrorAdmissionService implements ClientErrorBudget {
	constructor(
		private readonly reports: ClientErrorReportRepository,
		private readonly limits: ClientErrorBudgetLimits
	) {}

	async admit(report: ClientErrorReport, now: DateTime): Promise<ClientErrorAdmission> {
		const at = Date.parse(now);
		const reservation = await this.reports.reserve(
			fingerprint(report),
			now,
			new Date(at - this.limits.windowMs).toISOString() as DateTime,
			this.limits.reportsPerWindow
		);
		switch (reservation.kind) {
			case 'reserved':
				return { kind: 'accepted', suppressed: reservation.suppressed };
			case 'duplicate':
				return { kind: 'duplicate' };
			case 'exhausted':
				return {
					kind: 'rate_limited',
					retryAfterMs: Math.max(1, this.limits.windowMs - (at - Date.parse(reservation.oldest)))
				};
		}
	}
}
