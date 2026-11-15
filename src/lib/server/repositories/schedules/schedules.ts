import type { DueSchedule, Schedule, ScheduleId, ScheduleOccurrence } from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';

/** One user's schedules. Every read and write is scoped to the actor the repository was built for. */
export interface ScheduleRepository {
	list(): Promise<readonly Schedule[]>;
	findById(id: ScheduleId): Promise<Schedule | undefined>;
	/** Locks the row for the rest of the transaction, so a change is decided on the current schedule. */
	findByIdForUpdate(id: ScheduleId): Promise<Schedule | undefined>;
	insert(schedule: Schedule): Promise<Schedule>;
	update(schedule: Schedule): Promise<Schedule>;
	delete(id: ScheduleId): Promise<void>;
}

/** One user's schedule runs. */
export interface ScheduleOccurrenceRepository {
	insert(occurrence: ScheduleOccurrence): Promise<ScheduleOccurrence>;
	/** Whether a run of this schedule is parked until its owner decides. */
	hasRunAwaitingApproval(scheduleId: ScheduleId): Promise<boolean>;
}

/** Schedules across every user, for the worker that starts their runs. */
export interface ScheduleBacklogRepository {
	/** Every active schedule whose next run is at or before `now`, earliest first. */
	listDue(now: DateTime): Promise<readonly DueSchedule[]>;
}
