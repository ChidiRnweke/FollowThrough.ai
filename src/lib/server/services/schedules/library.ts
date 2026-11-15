import { NotFoundError } from '$lib/errors';
import type { Schedule, ScheduleId } from '$lib/models/schedules';
import type { ScheduleRepository } from '$lib/server/repositories/schedules';

export interface ScheduleReader {
	list(): Promise<readonly Schedule[]>;
	/** @throws NotFoundError if the actor has no such schedule. */
	get(scheduleId: ScheduleId): Promise<Schedule>;
}

export interface ScheduleWriter {
	/**
	 * The current schedule, locked until the transaction ends.
	 * @throws NotFoundError if the actor has no such schedule.
	 */
	getForChange(scheduleId: ScheduleId): Promise<Schedule>;
	create(schedule: Schedule): Promise<Schedule>;
	save(schedule: Schedule): Promise<Schedule>;
	remove(scheduleId: ScheduleId): Promise<void>;
}

/**
 * A user's saved schedules (ADR 0052). The repository is built for one actor, so every read and
 * write here is already that user's own.
 */
export class ScheduleLibrary implements ScheduleReader, ScheduleWriter {
	constructor(private readonly schedules: ScheduleRepository) {}

	list(): Promise<readonly Schedule[]> {
		return this.schedules.list();
	}

	async get(scheduleId: ScheduleId): Promise<Schedule> {
		const schedule = await this.schedules.findById(scheduleId);
		if (!schedule) throw new NotFoundError('Schedule was not found', { scheduleId });
		return schedule;
	}

	async getForChange(scheduleId: ScheduleId): Promise<Schedule> {
		const schedule = await this.schedules.findByIdForUpdate(scheduleId);
		if (!schedule) throw new NotFoundError('Schedule was not found', { scheduleId });
		return schedule;
	}

	create(schedule: Schedule): Promise<Schedule> {
		return this.schedules.insert(schedule);
	}

	save(schedule: Schedule): Promise<Schedule> {
		return this.schedules.update(schedule);
	}

	remove(scheduleId: ScheduleId): Promise<void> {
		return this.schedules.delete(scheduleId);
	}
}
