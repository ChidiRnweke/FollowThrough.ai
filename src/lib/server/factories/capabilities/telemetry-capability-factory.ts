import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import { clientErrorBudgetLimits } from '$lib/server/config';
import type { TelemetryDependencies } from '$lib/server/controllers/telemetry/controller';
import type { Database } from '$lib/server/db';
import { writeClientErrorLog } from '$lib/server/infrastructure/telemetry/client-error-log';
import { tracedService } from '$lib/server/infrastructure/telemetry/service-boundary';
import { ClientErrorReportRecords } from '$lib/server/repositories/telemetry/postgres/client-error-reports';
import { ClientErrorAdmissionService } from '$lib/server/services/telemetry/client-error-admission';

export interface TelemetryCapabilityInput {
	readonly db: Database;
	readonly now: () => DateTime;
}

export const createTelemetryCapability = (
	actor: ActorContext,
	input: TelemetryCapabilityInput
): TelemetryDependencies => ({
	budget: tracedService(
		'ClientErrorAdmissionService',
		new ClientErrorAdmissionService(
			new ClientErrorReportRecords(actor, input.db),
			clientErrorBudgetLimits()
		)
	),
	log: writeClientErrorLog,
	now: input.now
});
