import type { Schedule, ScheduleId } from '$lib/models/schedules';

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
