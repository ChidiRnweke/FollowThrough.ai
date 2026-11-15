import { NotFoundError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { Schedule, ScheduleId } from '$lib/models/schedules';
import type { ScheduleRepository } from '$lib/server/repositories/schedules';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

/** Shared rows, as one table serves every user. Each repository reads and writes its actor's rows only. */
export class InMemoryScheduleTable implements SnapshotParticipant {
	rows: readonly Schedule[] = [];

	snapshot(): RestoreSnapshot {
		const rows = this.rows;
		return () => {
			this.rows = rows;
		};
	}
}

export class InMemoryScheduleRepository implements ScheduleRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly table: InMemoryScheduleTable
	) {}

	async list(): Promise<readonly Schedule[]> {
		return this.table.rows.filter((schedule) => schedule.userId === this.actor.userId);
	}

	async findById(id: ScheduleId): Promise<Schedule | undefined> {
		return (await this.list()).find((schedule) => schedule.id === id);
	}

	findByIdForUpdate(id: ScheduleId): Promise<Schedule | undefined> {
		return this.findById(id);
	}

	async insert(schedule: Schedule): Promise<Schedule> {
		this.table.rows = [...this.table.rows, schedule];
		return schedule;
	}

	async update(schedule: Schedule): Promise<Schedule> {
		if (!(await this.findById(schedule.id)))
			throw new NotFoundError('Schedule was not found', { scheduleId: schedule.id });
		this.table.rows = this.table.rows.map((row) => (row.id === schedule.id ? schedule : row));
		return schedule;
	}

	async delete(id: ScheduleId): Promise<void> {
		if (!(await this.findById(id)))
			throw new NotFoundError('Schedule was not found', { scheduleId: id });
		this.table.rows = this.table.rows.filter((row) => row.id !== id);
	}
}
