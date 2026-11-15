import type { DateTime } from '$lib/models/workspace';
import type {
	ClientErrorFingerprint,
	ClientErrorReportRepository,
	ClientErrorReservation
} from '$lib/server/repositories/telemetry';

interface AdmittedReport {
	readonly fingerprint: ClientErrorFingerprint;
	readonly at: DateTime;
	suppressed: number;
}

/** One actor's admitted reports, kept with the same window rules as the Postgres records. */
export class InMemoryClientErrorReports implements ClientErrorReportRepository {
	private reports: AdmittedReport[] = [];

	async reserve(
		fingerprint: ClientErrorFingerprint,
		at: DateTime,
		since: DateTime,
		limit: number
	): Promise<ClientErrorReservation> {
		const inWindow = this.reports.filter((report) => report.at > since);
		const repeated = inWindow.find((report) => report.fingerprint === fingerprint);
		if (repeated) {
			repeated.suppressed += 1;
			return { kind: 'duplicate' };
		}
		const oldest = inWindow.map((report) => report.at).sort()[0];
		if (oldest && inWindow.length >= limit) return { kind: 'exhausted', oldest };
		const suppressed = this.reports.reduce((total, report) => total + report.suppressed, 0);
		this.reports = inWindow.map((report) => ({ ...report, suppressed: 0 }));
		this.reports.push({ fingerprint, at, suppressed: 0 });
		return { kind: 'reserved', suppressed };
	}
}
