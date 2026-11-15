import { tracedService } from '$lib/server/infrastructure/telemetry/service-boundary';
import type { ActorContext } from '$lib/models/identity';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { SchedulesDependencies } from '$lib/server/controllers/schedules/controller';
import type { Database } from '$lib/server/db';
import { ScheduleRecords } from '$lib/server/repositories/schedules/postgres/schedules';
import { ScheduleLibrary } from '$lib/server/services/schedules/library';
import { ScheduleRules } from '$lib/services/schedules/rules';

export interface SchedulesCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: AtomicOperation;
	readonly now: () => DateTime;
}

export interface SchedulesCapability {
	readonly controller: SchedulesDependencies;
}

export const createSchedulesCapability = (
	actor: ActorContext,
	input: SchedulesCapabilityInput
): SchedulesCapability => {
	const library = tracedService(
		'ScheduleLibrary',
		new ScheduleLibrary(new ScheduleRecords(actor, input.db))
	);
	return {
		controller: {
			now: input.now,
			rules: new ScheduleRules(),
			reader: library,
			writer: library,
			transactionRunner: input.transactionRunner
		}
	};
};
