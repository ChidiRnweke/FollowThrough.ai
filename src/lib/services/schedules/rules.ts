import {
	CalendarDateTime,
	endOfMonth,
	fromAbsolute,
	getDayOfWeek,
	parseDate,
	toCalendarDate,
	toZoned,
	type CalendarDate
} from '@internationalized/date';
import type { AgentExecutionMode } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import {
	WEEKDAYS,
	type DueDecision,
	type IanaTimeZone,
	type NextOccurrence,
	type Recurrence,
	type Schedule,
	type ScheduleChanges,
	type ScheduleDecision,
	type ScheduleDefinition,
	type ScheduleId,
	type TimeOfDay
} from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';

export interface ScheduleRecurrence {
	/** The first occurrence strictly after `after`. */
	next(recurrence: Recurrence, timeZone: IanaTimeZone, after: DateTime): NextOccurrence;
}

export interface ScheduleEdits {
	create(
		definition: ScheduleDefinition,
		identity: { readonly id: ScheduleId; readonly userId: UserId },
		now: DateTime
	): ScheduleDecision;
	/** A paused schedule stays paused, whatever changes. */
	change(schedule: Schedule, changes: ScheduleChanges, now: DateTime): ScheduleDecision;
	pause(schedule: Schedule, now: DateTime): Schedule;
	/** Makes the schedule active from its next occurrence after `now`. */
	resume(schedule: Schedule, now: DateTime): ScheduleDecision;
	withExecutionMode(schedule: Schedule, executionMode: AgentExecutionMode, now: DateTime): Schedule;
}

export interface ScheduleDue {
	/**
	 * What to do with a schedule now. A schedule that was missed while the worker was down runs
	 * once, for the latest occurrence that passed. `waiting` says a run of it still waits for
	 * approval; that occurrence is skipped.
	 */
	due(schedule: Schedule, now: DateTime, waiting: boolean): DueDecision;
}

type Repeating = Exclude<Recurrence, { kind: 'once' }>;
type Unscheduled = Omit<Schedule, 'status' | 'nextRunAt'>;

/**
 * When a schedule runs, and what state a change leaves it in (ADR 0052). The server stores the
 * result; the browser calls the same rule to preview a schedule that is not saved yet.
 *
 * A recurrence names wall-clock times in the schedule's zone. On a day when the clocks go
 * forward, a time that does not exist runs at the later instant. On a day when they go back, a
 * time that occurs twice runs once, at the earlier instant.
 */
export class ScheduleRules implements ScheduleRecurrence, ScheduleEdits, ScheduleDue {
	next(recurrence: Recurrence, timeZone: IanaTimeZone, after: DateTime): NextOccurrence {
		const afterMs = Date.parse(after);
		if (recurrence.kind === 'once') {
			const at = this.instant(parseDate(recurrence.date), recurrence.time, timeZone);
			return at > afterMs ? this.at(at) : { kind: 'none' };
		}
		// A skipped time on the day before can land on this day, so the walk starts a day early.
		// It ends because every repeating recurrence has a time in any month.
		for (
			let date = toCalendarDate(fromAbsolute(afterMs, timeZone)).subtract({ days: 1 });
			;
			date = date.add({ days: 1 })
		) {
			const at = this.timesOn(recurrence, date)
				.map((time) => this.instant(date, time, timeZone))
				.find((instant) => instant > afterMs);
			if (at !== undefined) return this.at(at);
		}
	}

	create(
		definition: ScheduleDefinition,
		identity: { readonly id: ScheduleId; readonly userId: UserId },
		now: DateTime
	): ScheduleDecision {
		return this.activate({ ...definition, ...identity, createdAt: now, updatedAt: now }, now);
	}

	change(schedule: Schedule, changes: ScheduleChanges, now: DateTime): ScheduleDecision {
		const changed = { ...schedule, ...changes, updatedAt: now };
		const retimed = changes.recurrence !== undefined || changes.timeZone !== undefined;
		if (!retimed || schedule.status === 'paused') return { kind: 'scheduled', schedule: changed };
		return this.activate(this.unscheduled(changed), now);
	}

	pause(schedule: Schedule, now: DateTime): Schedule {
		if (schedule.status !== 'active') return schedule;
		return { ...this.unscheduled(schedule), status: 'paused', updatedAt: now };
	}

	resume(schedule: Schedule, now: DateTime): ScheduleDecision {
		if (schedule.status === 'active') return { kind: 'scheduled', schedule };
		return this.activate({ ...this.unscheduled(schedule), updatedAt: now }, now);
	}

	withExecutionMode(
		schedule: Schedule,
		executionMode: AgentExecutionMode,
		now: DateTime
	): Schedule {
		return { ...schedule, executionMode, updatedAt: now };
	}

	due(schedule: Schedule, now: DateTime, waiting: boolean): DueDecision {
		if (schedule.status !== 'active' || Date.parse(schedule.nextRunAt) > Date.parse(now))
			return { kind: 'not_due' };
		const next = this.next(schedule.recurrence, schedule.timeZone, now);
		const rest = { ...this.unscheduled(schedule), updatedAt: now };
		const moved: Schedule =
			next.kind === 'at'
				? { ...rest, status: 'active', nextRunAt: next.at }
				: { ...rest, status: 'finished' };
		if (waiting) return { kind: 'skipped', schedule: moved };
		return {
			kind: 'due',
			scheduledFor: this.latest(schedule, schedule.nextRunAt, now),
			schedule: moved
		};
	}

	/** The last occurrence at or before `now`, counted on from one that has already passed. */
	private latest(
		schedule: Pick<Schedule, 'recurrence' | 'timeZone'>,
		passed: DateTime,
		now: DateTime
	): DateTime {
		const next = this.next(schedule.recurrence, schedule.timeZone, passed);
		if (next.kind === 'none' || Date.parse(next.at) > Date.parse(now)) return passed;
		return this.latest(schedule, next.at, now);
	}

	private activate(schedule: Unscheduled, now: DateTime): ScheduleDecision {
		const next = this.next(schedule.recurrence, schedule.timeZone, now);
		if (next.kind === 'none') return { kind: 'no_future_occurrence' };
		return { kind: 'scheduled', schedule: { ...schedule, status: 'active', nextRunAt: next.at } };
	}

	private unscheduled(schedule: Schedule): Unscheduled {
		return {
			id: schedule.id,
			userId: schedule.userId,
			title: schedule.title,
			prompt: schedule.prompt,
			recurrence: schedule.recurrence,
			timeZone: schedule.timeZone,
			executionMode: schedule.executionMode,
			createdAt: schedule.createdAt,
			updatedAt: schedule.updatedAt
		};
	}

	/** The wall-clock times a repeating recurrence names on one local date, earliest first. */
	private timesOn(recurrence: Repeating, date: CalendarDate): readonly TimeOfDay[] {
		const weekday = getDayOfWeek(date, 'en-US', 'mon');
		switch (recurrence.kind) {
			case 'hourly':
				return Array.from({ length: 24 }, (_, hour) => ({ hour, minute: recurrence.minute }));
			case 'daily':
				return [recurrence.time];
			case 'weekdays':
				return weekday < 5 ? [recurrence.time] : [];
			case 'weekly':
				return WEEKDAYS[weekday] === recurrence.weekday ? [recurrence.time] : [];
			case 'monthly':
				return date.day === Math.min(recurrence.day, endOfMonth(date).day) ? [recurrence.time] : [];
		}
	}

	private instant(date: CalendarDate, time: TimeOfDay, timeZone: IanaTimeZone): number {
		const local = new CalendarDateTime(date.year, date.month, date.day, time.hour, time.minute);
		return toZoned(local, timeZone, 'compatible').toDate().getTime();
	}

	private at(instant: number): NextOccurrence {
		return { kind: 'at', at: new Date(instant).toISOString() as DateTime };
	}
}
