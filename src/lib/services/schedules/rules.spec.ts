import { describe, expect, it } from 'vitest';
import type { IanaTimeZone, Recurrence } from '$lib/models/schedules';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import {
	brussels,
	mondayMorning,
	scheduleBuilder,
	testScheduleId,
	tuesdayRun
} from '$lib/testing/schedules/fixtures/schedules';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { ScheduleRules } from './rules';

const rules = new ScheduleRules();
const instant = (value: string) => value as DateTime;
const next = (recurrence: Recurrence, after: string, timeZone: IanaTimeZone = brussels) =>
	rules.next(recurrence, timeZone, instant(after));
const at = (value: string) => ({ kind: 'at', at: value });

describe('the next occurrence of a recurrence', () => {
	it('is the same wall-clock time on the next day for a daily recurrence', () => {
		expect(next({ kind: 'daily', time: { hour: 8, minute: 0 } }, mondayMorning)).toEqual(
			at('2026-11-17T07:00:00.000Z')
		);
	});

	it('is strictly after the instant it is asked from', () => {
		const mondays: Recurrence = { kind: 'weekly', weekday: 'mon', time: { hour: 9, minute: 0 } };

		expect(next(mondays, '2026-11-16T08:00:00.000Z')).toEqual(at('2026-11-23T08:00:00.000Z'));
	});

	it('skips the weekend for a weekday recurrence', () => {
		const weekdays: Recurrence = { kind: 'weekdays', time: { hour: 8, minute: 0 } };

		expect(next(weekdays, '2026-11-13T08:00:00.000Z')).toEqual(at('2026-11-16T07:00:00.000Z'));
	});

	it('runs on the last day of a month that is shorter than the chosen day', () => {
		const monthEnd: Recurrence = { kind: 'monthly', day: 31, time: { hour: 9, minute: 0 } };

		expect(next(monthEnd, '2027-02-01T00:00:00.000Z')).toEqual(at('2027-02-28T08:00:00.000Z'));
	});

	it('runs at the later instant when the clocks go forward over its time', () => {
		// On 29 March 2026 Brussels goes from 02:00 to 03:00, so 02:30 does not exist.
		const night: Recurrence = { kind: 'daily', time: { hour: 2, minute: 30 } };

		expect(next(night, '2026-03-28T12:00:00.000Z')).toEqual(at('2026-03-29T01:30:00.000Z'));
	});

	it('runs once when the clocks go back over its time', () => {
		// On 25 October 2026 Brussels has 02:30 twice: at 00:30Z and again at 01:30Z.
		const night: Recurrence = { kind: 'daily', time: { hour: 2, minute: 30 } };

		expect([
			next(night, '2026-10-24T12:00:00.000Z'),
			next(night, '2026-10-25T00:30:00.000Z')
		]).toEqual([at('2026-10-25T00:30:00.000Z'), at('2026-10-26T01:30:00.000Z')]);
	});

	it('names the minute on the local clock of a zone that is not on a whole hour', () => {
		// 08:00Z is 13:30 in Kolkata, so the next quarter past is 14:15 there.
		const quarterPast: Recurrence = { kind: 'hourly', minute: 15 };

		expect(next(quarterPast, '2026-11-16T08:00:00.000Z', 'Asia/Kolkata' as IanaTimeZone)).toEqual(
			at('2026-11-16T08:45:00.000Z')
		);
	});

	it('gives each wall-clock hour one run when the clocks go back', () => {
		const halfPast: Recurrence = { kind: 'hourly', minute: 30 };

		expect([
			next(halfPast, '2026-10-25T00:00:00.000Z'),
			next(halfPast, '2026-10-25T00:30:00.000Z')
		]).toEqual([at('2026-10-25T00:30:00.000Z'), at('2026-10-25T02:30:00.000Z')]);
	});

	it('has none once a one-off time has passed', () => {
		const once: Recurrence = {
			kind: 'once',
			date: '2026-12-01' as LocalDate,
			time: { hour: 9, minute: 0 }
		};

		expect([next(once, mondayMorning), next(once, '2026-12-01T08:00:00.000Z')]).toEqual([
			at('2026-12-01T08:00:00.000Z'),
			{ kind: 'none' }
		]);
	});
});

describe('a change to a schedule', () => {
	const identity = { id: testScheduleId(), userId: testActor().userId };
	const definition = {
		title: 'Morning brief',
		prompt: 'Write a brief of what is due today as a note in Inbox.',
		recurrence: { kind: 'weekdays', time: { hour: 8, minute: 0 } },
		timeZone: brussels,
		executionMode: 'approval_required'
	} as const;

	it('creates an active schedule that runs at its next occurrence', () => {
		expect(rules.create(definition, identity, mondayMorning)).toEqual({
			kind: 'scheduled',
			schedule: scheduleBuilder()
		});
	});

	it('refuses a one-off schedule whose time has passed', () => {
		const past: Recurrence = {
			kind: 'once',
			date: '2026-11-01' as LocalDate,
			time: { hour: 9, minute: 0 }
		};

		expect(rules.create({ ...definition, recurrence: past }, identity, mondayMorning)).toEqual({
			kind: 'no_future_occurrence'
		});
	});

	it('keeps the next run when only the words change', () => {
		const later = instant('2026-11-16T10:00:00.000Z');

		expect(rules.change(scheduleBuilder(), { title: 'Daily brief' }, later)).toEqual({
			kind: 'scheduled',
			schedule: scheduleBuilder({ title: 'Daily brief', updatedAt: later })
		});
	});

	it('moves the next run when the recurrence changes', () => {
		const fridays: Recurrence = { kind: 'weekly', weekday: 'fri', time: { hour: 16, minute: 0 } };

		expect(rules.change(scheduleBuilder(), { recurrence: fridays }, mondayMorning)).toEqual({
			kind: 'scheduled',
			schedule: scheduleBuilder({
				recurrence: fridays,
				status: 'active',
				nextRunAt: instant('2026-11-20T15:00:00.000Z')
			})
		});
	});

	it('leaves a paused schedule paused when its recurrence changes', () => {
		const paused = scheduleBuilder({ status: 'paused' });
		const daily: Recurrence = { kind: 'daily', time: { hour: 7, minute: 0 } };

		expect(rules.change(paused, { recurrence: daily }, mondayMorning)).toEqual({
			kind: 'scheduled',
			schedule: scheduleBuilder({ status: 'paused', recurrence: daily })
		});
	});

	it('pauses an active schedule and resumes it from the next occurrence', () => {
		const paused = rules.pause(scheduleBuilder(), mondayMorning);
		const wednesday = instant('2026-11-18T12:00:00.000Z');

		expect([paused, rules.resume(paused, wednesday)]).toEqual([
			scheduleBuilder({ status: 'paused' }),
			{
				kind: 'scheduled',
				schedule: scheduleBuilder({
					status: 'active',
					nextRunAt: instant('2026-11-19T07:00:00.000Z'),
					updatedAt: wednesday
				})
			}
		]);
	});

	it('runs a finished one-off schedule again when it gets a later date', () => {
		const finished = scheduleBuilder({
			status: 'finished',
			recurrence: { kind: 'once', date: '2026-11-02' as LocalDate, time: { hour: 9, minute: 0 } }
		});
		const december: Recurrence = {
			kind: 'once',
			date: '2026-12-01' as LocalDate,
			time: { hour: 9, minute: 0 }
		};

		expect(rules.change(finished, { recurrence: december }, mondayMorning)).toEqual({
			kind: 'scheduled',
			schedule: scheduleBuilder({
				recurrence: december,
				status: 'active',
				nextRunAt: instant('2026-12-01T08:00:00.000Z')
			})
		});
	});

	it('does not move the next run when the execution mode changes', () => {
		expect(rules.withExecutionMode(scheduleBuilder(), 'auto_accept', mondayMorning)).toEqual(
			scheduleBuilder({ executionMode: 'auto_accept', status: 'active', nextRunAt: tuesdayRun })
		);
	});
});

describe('a schedule the worker finds', () => {
	const afterTuesdayRun = instant('2026-11-17T07:00:20.000Z');

	it('is not due before its next run, or when it is not active', () => {
		expect([
			rules.due(scheduleBuilder(), mondayMorning, false),
			rules.due(scheduleBuilder({ status: 'paused' }), afterTuesdayRun, false)
		]).toEqual([{ kind: 'not_due' }, { kind: 'not_due' }]);
	});

	it('runs for the occurrence that came due and moves on to the next', () => {
		expect(rules.due(scheduleBuilder(), afterTuesdayRun, false)).toEqual({
			kind: 'due',
			scheduledFor: tuesdayRun,
			schedule: scheduleBuilder({
				status: 'active',
				nextRunAt: instant('2026-11-18T07:00:00.000Z'),
				updatedAt: afterTuesdayRun
			})
		});
	});

	it('runs once, for the latest occurrence, after several were missed', () => {
		// The worker was down from Tuesday to Friday morning: Tuesday, Wednesday, Thursday and
		// Friday at 08:00 all passed.
		const fridayMidday = instant('2026-11-20T11:00:00.000Z');

		expect(rules.due(scheduleBuilder(), fridayMidday, false)).toEqual({
			kind: 'due',
			scheduledFor: '2026-11-20T07:00:00.000Z',
			schedule: scheduleBuilder({
				status: 'active',
				nextRunAt: instant('2026-11-23T07:00:00.000Z'),
				updatedAt: fridayMidday
			})
		});
	});

	it('skips the occurrence while an earlier run waits for approval, and still moves on', () => {
		expect(rules.due(scheduleBuilder(), afterTuesdayRun, true)).toEqual({
			kind: 'skipped',
			schedule: scheduleBuilder({
				status: 'active',
				nextRunAt: instant('2026-11-18T07:00:00.000Z'),
				updatedAt: afterTuesdayRun
			})
		});
	});

	it('finishes a one-off schedule with its run', () => {
		const once: Recurrence = {
			kind: 'once',
			date: '2026-11-17' as LocalDate,
			time: { hour: 8, minute: 0 }
		};

		expect(rules.due(scheduleBuilder({ recurrence: once }), afterTuesdayRun, false)).toEqual({
			kind: 'due',
			scheduledFor: tuesdayRun,
			schedule: scheduleBuilder({
				recurrence: once,
				status: 'finished',
				updatedAt: afterTuesdayRun
			})
		});
	});
});
