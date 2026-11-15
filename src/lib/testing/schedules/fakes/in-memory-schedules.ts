import { NotFoundError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { AgentRunId, AgentRunStatus } from '$lib/models/agent';
import type { Schedule, ScheduleId, ScheduleOccurrence, ScheduleRun } from '$lib/models/schedules';
import type {
	ScheduleOccurrenceRepository,
	ScheduleRepository
} from '$lib/server/repositories/schedules';
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

/**
 * A user's schedule runs. Postgres answers "is a run waiting?" by joining the run's row, so the
 * fake reads the run's status from the store that holds the runs.
 */
export class InMemoryScheduleOccurrenceRepository
	implements ScheduleOccurrenceRepository, SnapshotParticipant
{
	occurrences: readonly ScheduleOccurrence[] = [];

	constructor(private readonly runStatus: (runId: AgentRunId) => AgentRunStatus | undefined) {}

	async insert(occurrence: ScheduleOccurrence): Promise<ScheduleOccurrence> {
		this.occurrences = [...this.occurrences, occurrence];
		return occurrence;
	}

	async listForSchedule(scheduleId: ScheduleId): Promise<readonly ScheduleRun[]> {
		return this.occurrences
			.filter((occurrence) => occurrence.scheduleId === scheduleId)
			.flatMap((occurrence) => {
				// The join drops an occurrence whose run is gone, as the foreign key deletes it.
				const status = this.runStatus(occurrence.runId);
				return status ? [{ ...occurrence, status }] : [];
			})
			.toSorted((left, right) => right.scheduledFor.localeCompare(left.scheduledFor));
	}

	async hasRunAwaitingApproval(scheduleId: ScheduleId): Promise<boolean> {
		return this.occurrences.some(
			(occurrence) =>
				occurrence.scheduleId === scheduleId &&
				this.runStatus(occurrence.runId) === 'awaiting_approval'
		);
	}

	snapshot(): RestoreSnapshot {
		const occurrences = this.occurrences;
		return () => {
			this.occurrences = occurrences;
		};
	}
}
