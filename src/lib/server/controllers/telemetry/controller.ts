import type { ActorContext, UserId } from '$lib/models/identity';
import type { ClientErrorAdmission, ClientErrorReport } from '$lib/models/telemetry/client-error';
import type { DateTime } from '$lib/models/workspace';
import type { ClientErrorBudget } from '$lib/server/services/telemetry/client-error-admission';

/** Writes an admitted report where operators read browser failures. */
export type ClientErrorLog = (
	userId: UserId,
	report: ClientErrorReport,
	/** Repeats dropped since the user's previous admitted report. */
	suppressed: number
) => void;

export interface TelemetryController {
	/**
	 * Writes a browser failure report to the log once it is admitted. A repeat inside the window
	 * and a report past the user's budget are not written; the result says which happened.
	 */
	reportClientError(report: ClientErrorReport): Promise<ClientErrorAdmission>;
}

export interface TelemetryDependencies {
	readonly budget: ClientErrorBudget;
	readonly log: ClientErrorLog;
	readonly now: () => DateTime;
}

export class Telemetry implements TelemetryController {
	constructor(
		private readonly actor: ActorContext,
		private readonly dependencies: TelemetryDependencies
	) {}

	async reportClientError(report: ClientErrorReport): Promise<ClientErrorAdmission> {
		const admission = await this.dependencies.budget.admit(report, this.dependencies.now());
		if (admission.kind === 'accepted')
			this.dependencies.log(this.actor.userId, report, admission.suppressed);
		return admission;
	}
}
