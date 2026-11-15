import type { UserId } from '$lib/models/identity';
import type { IanaTimeZone, Schedule, ScheduleId } from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

export const testScheduleId = (value = 1): ScheduleId =>
	`00000000-0000-4000-80a1-${String(value).padStart(12, '0')}` as ScheduleId;

export const brussels = 'Europe/Brussels' as IanaTimeZone;

/** Monday 16 November 2026, 09:12 in Brussels. */
export const mondayMorning = '2026-11-16T08:12:00.000Z' as DateTime;

/** A weekday schedule at 08:00 in Brussels, saved on Monday morning: it next runs on Tuesday. */
export const scheduleBuilder = (overrides: Partial<Schedule> = {}): Schedule => {
	const schedule = {
		id: testScheduleId(),
		userId: testActor().userId as UserId,
		title: 'Morning brief',
		prompt: 'Write a brief of what is due today as a note in Inbox.',
		recurrence: { kind: 'weekdays' as const, time: { hour: 8, minute: 0 } },
		timeZone: brussels,
		executionMode: 'approval_required' as const,
		createdAt: mondayMorning,
		updatedAt: mondayMorning,
		...overrides
	};
	if (overrides.status === 'paused' || overrides.status === 'finished')
		return { ...schedule, status: overrides.status };
	return {
		...schedule,
		status: 'active',
		nextRunAt: (overrides.status === 'active' && overrides.nextRunAt) || tuesdayRun
	};
};

/** Tuesday 17 November 2026, 08:00 in Brussels. */
export const tuesdayRun = '2026-11-17T07:00:00.000Z' as DateTime;
