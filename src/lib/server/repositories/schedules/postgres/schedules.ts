import { and, asc, eq } from 'drizzle-orm';
import { NotFoundError } from '$lib/errors';
import type { ActorContext, UserId } from '$lib/models/identity';
import {
	ianaTimeZoneSchema,
	recurrenceSchema,
	type Schedule,
	type ScheduleId,
	type ScheduleState
} from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/schedules';
import type { ScheduleRepository } from '$lib/server/repositories/schedules';

type ScheduleRow = typeof schema.schedules.$inferSelect;

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

/** The table's checks allow exactly these states; any other row is one this code did not write. */
const toState = (row: ScheduleRow): ScheduleState => {
	if (row.status === 'active' && row.nextRunAt)
		return { status: 'active', nextRunAt: instant(row.nextRunAt) };
	if (row.status === 'paused' || row.status === 'finished') return { status: row.status };
	throw new Error(`Schedule ${row.id} has the unknown status "${row.status}"`);
};

/** The recurrence is a JSON column and the zone is free text, so both are parsed where they leave the database. */
const toSchedule = (row: ScheduleRow): Schedule => ({
	id: row.id as ScheduleId,
	userId: row.userId as UserId,
	title: row.title,
	prompt: row.prompt,
	recurrence: recurrenceSchema.parse(row.recurrence),
	timeZone: ianaTimeZoneSchema.parse(row.timeZone),
	executionMode: row.executionMode,
	...toState(row),
	createdAt: instant(row.createdAt),
	updatedAt: instant(row.updatedAt)
});

const stateColumns = (schedule: Schedule) => ({
	status: schedule.status,
	nextRunAt: schedule.status === 'active' ? new Date(schedule.nextRunAt) : null
});

export class ScheduleRecords implements ScheduleRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	private owned(id: ScheduleId) {
		return and(eq(schema.schedules.id, id), eq(schema.schedules.userId, this.actor.userId));
	}

	async list(): Promise<readonly Schedule[]> {
		return (
			await this.database
				.select()
				.from(schema.schedules)
				.where(eq(schema.schedules.userId, this.actor.userId))
				.orderBy(asc(schema.schedules.createdAt), asc(schema.schedules.id))
		).map(toSchedule);
	}

	async findById(id: ScheduleId): Promise<Schedule | undefined> {
		const [row] = await this.database.select().from(schema.schedules).where(this.owned(id));
		return row ? toSchedule(row) : undefined;
	}

	async findByIdForUpdate(id: ScheduleId): Promise<Schedule | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.schedules)
			.where(this.owned(id))
			.for('update');
		return row ? toSchedule(row) : undefined;
	}

	async insert(schedule: Schedule): Promise<Schedule> {
		const [row] = await this.database
			.insert(schema.schedules)
			.values({
				id: schedule.id,
				userId: this.actor.userId,
				title: schedule.title,
				prompt: schedule.prompt,
				recurrence: schedule.recurrence,
				timeZone: schedule.timeZone,
				executionMode: schedule.executionMode,
				...stateColumns(schedule),
				createdAt: new Date(schedule.createdAt),
				updatedAt: new Date(schedule.updatedAt)
			})
			.returning();
		return toSchedule(row!);
	}

	async update(schedule: Schedule): Promise<Schedule> {
		const [row] = await this.database
			.update(schema.schedules)
			.set({
				title: schedule.title,
				prompt: schedule.prompt,
				recurrence: schedule.recurrence,
				timeZone: schedule.timeZone,
				executionMode: schedule.executionMode,
				...stateColumns(schedule),
				updatedAt: new Date(schedule.updatedAt)
			})
			.where(this.owned(schedule.id))
			.returning();
		if (!row) throw new NotFoundError('Schedule was not found', { scheduleId: schedule.id });
		return toSchedule(row);
	}

	async delete(id: ScheduleId): Promise<void> {
		const deleted = await this.database
			.delete(schema.schedules)
			.where(this.owned(id))
			.returning({ id: schema.schedules.id });
		if (deleted.length === 0) throw new NotFoundError('Schedule was not found', { scheduleId: id });
	}
}
