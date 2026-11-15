import { tracedService } from '$lib/server/infrastructure/telemetry/service-boundary';
import type { ActorContext } from '$lib/models/identity';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { AgentHarnessDependencies } from '$lib/server/controllers/agent/controller';
import type { SchedulesDependencies } from '$lib/server/controllers/schedules/controller';
import type { Database } from '$lib/server/db';
import {
	ScheduleOccurrenceRecords,
	ScheduleRecords
} from '$lib/server/repositories/schedules/postgres/schedules';
import { ScheduleLibrary } from '$lib/server/services/schedules/library';
import { ScheduleRuns } from '$lib/server/services/schedules/runs';
import { ScheduleRules } from '$lib/services/schedules/rules';

export interface SchedulesCapabilityInput {
	readonly db: Database;
	readonly transactionRunner: AtomicOperation;
	readonly now: () => DateTime;
}

export interface SchedulesCapability {
	readonly controller: SchedulesDependencies;
	/** What the agent harness needs to start the run of a due schedule. */
	readonly harness: Pick<AgentHarnessDependencies, 'schedules' | 'scheduleRules' | 'scheduleRuns'>;
}

export const createSchedulesCapability = (
	actor: ActorContext,
	input: SchedulesCapabilityInput
): SchedulesCapability => {
	const library = tracedService(
		'ScheduleLibrary',
		new ScheduleLibrary(new ScheduleRecords(actor, input.db))
	);
	const rules = new ScheduleRules();
	const runs = tracedService(
		'ScheduleRuns',
		new ScheduleRuns(new ScheduleOccurrenceRecords(actor, input.db))
	);
	return {
		controller: {
			now: input.now,
			rules,
			reader: library,
			writer: library,
			runs,
			transactionRunner: input.transactionRunner
		},
		harness: {
			schedules: library,
			scheduleRules: rules,
			scheduleRuns: runs
		}
	};
};
