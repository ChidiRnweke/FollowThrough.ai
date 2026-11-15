import type { DueSchedule, ScheduleId, ScheduleOccurrence } from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';
import type {
	ScheduleBacklogRepository,
	ScheduleOccurrenceRepository
} from '$lib/server/repositories/schedules';

/** The record of which occurrences ran, written with the run each one started. */
export interface ScheduleRunLog {
	record(occurrence: ScheduleOccurrence): Promise<ScheduleOccurrence>;
	/** Whether a run of this schedule still waits for its owner's approval. */
	hasWaitingRun(scheduleId: ScheduleId): Promise<boolean>;
}

/** A user's schedule runs (ADR 0052). */
export class ScheduleRuns implements ScheduleRunLog {
	constructor(private readonly occurrences: ScheduleOccurrenceRepository) {}

	record(occurrence: ScheduleOccurrence): Promise<ScheduleOccurrence> {
		return this.occurrences.insert(occurrence);
	}

	hasWaitingRun(scheduleId: ScheduleId): Promise<boolean> {
		return this.occurrences.hasRunAwaitingApproval(scheduleId);
	}
}

export interface ScheduleBacklog {
	/** The schedules whose time has come, across every user. */
	due(): Promise<readonly DueSchedule[]>;
}

export class ScheduleBacklogService implements ScheduleBacklog {
	constructor(
		private readonly schedules: ScheduleBacklogRepository,
		private readonly now: () => DateTime
	) {}

	due(): Promise<readonly DueSchedule[]> {
		return this.schedules.listDue(this.now());
	}
}
