import type {
	DueSchedule,
	ScheduleId,
	ScheduleOccurrence,
	ScheduleOccurrenceId,
	ScheduleRun
} from '$lib/models/schedules';
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

export interface ScheduleRunReader {
	/** Every run of a schedule, newest first. */
	list(scheduleId: ScheduleId): Promise<readonly ScheduleRun[]>;
}

export interface ScheduleRunOpening {
	/**
	 * Records that the run's owner opened its chat at `at`.
	 * @throws NotFoundError if the actor has no such run.
	 */
	opened(occurrenceId: ScheduleOccurrenceId, at: DateTime): Promise<void>;
}

/** A user's schedule runs (ADR 0052). */
export class ScheduleRuns implements ScheduleRunLog, ScheduleRunReader, ScheduleRunOpening {
	constructor(private readonly occurrences: ScheduleOccurrenceRepository) {}

	record(occurrence: ScheduleOccurrence): Promise<ScheduleOccurrence> {
		return this.occurrences.insert(occurrence);
	}

	opened(occurrenceId: ScheduleOccurrenceId, at: DateTime): Promise<void> {
		return this.occurrences.markOpened(occurrenceId, at);
	}

	list(scheduleId: ScheduleId): Promise<readonly ScheduleRun[]> {
		return this.occurrences.listForSchedule(scheduleId);
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
