import { describe, expect, it } from 'vitest';
import type { IanaTimeZone, Recurrence } from '$lib/models/schedules';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import {
	brussels,
	mondayMorning,
	scheduleBuilder,
	tuesdayRun
} from '$lib/testing/schedules/fixtures/schedules';
import { SchedulePresentationService } from './presentation';

const presentation = new SchedulePresentationService();
const instant = (value: string) => value as DateTime;
const eight = { hour: 8, minute: 0 };
const inBrussels = { now: mondayMorning, timeZone: brussels };

describe('how a schedule reads', () => {
	it('puts each kind of recurrence in words', () => {
		const recurrences: readonly Recurrence[] = [
			{ kind: 'once', date: '2026-12-01' as LocalDate, time: { hour: 9, minute: 0 } },
			{ kind: 'hourly', minute: 5 },
			{ kind: 'daily', time: eight },
			{ kind: 'weekdays', time: eight },
			{ kind: 'weekly', weekday: 'fri', time: { hour: 16, minute: 30 } },
			{ kind: 'monthly', day: 31, time: eight },
			{ kind: 'monthly', day: 22, time: eight },
			{ kind: 'monthly', day: 11, time: eight }
		];

		expect(recurrences.map((recurrence) => presentation.describe(recurrence))).toEqual([
			'Once on 1 Dec 2026 at 09:00',
			'Every hour at :05',
			'Every day at 08:00',
			'Weekdays at 08:00',
			'Fridays at 16:30',
			'Monthly on the 31st at 08:00',
			'Monthly on the 22nd at 08:00',
			'Monthly on the 11th at 08:00'
		]);
	});

	it('names a moment by the day it falls on in the schedule’s zone', () => {
		// 23:30Z on Monday is already Tuesday in Brussels.
		const moments = [
			'2026-11-16T07:00:00.000Z',
			'2026-11-16T23:30:00.000Z',
			'2026-11-15T15:00:00.000Z',
			'2026-11-20T15:00:00.000Z',
			'2027-01-04T07:00:00.000Z'
		];

		expect(
			moments.map((moment) => presentation.when(instant(moment), brussels, mondayMorning))
		).toEqual([
			'Today, 08:00',
			'Tomorrow, 00:30',
			'Yesterday, 16:00',
			'Fri 20 Nov, 16:00',
			'Mon 4 Jan 2027, 08:00'
		]);
	});

	it('captions a schedule with its recurrence, whether it asks, and its next run', () => {
		const inNewYork = { now: mondayMorning, timeZone: 'America/New_York' as IanaTimeZone };

		expect([
			presentation.caption(scheduleBuilder(), inBrussels),
			presentation.caption(scheduleBuilder({ executionMode: 'auto_accept' }), inNewYork),
			presentation.caption(scheduleBuilder({ status: 'paused' }), inBrussels),
			presentation.caption(scheduleBuilder({ status: 'finished' }), inBrussels)
		]).toEqual([
			'Weekdays at 08:00 · Asks first · Next: tomorrow, 08:00',
			'Weekdays at 08:00 · Brussels time · Does not ask · Next: tomorrow, 08:00',
			'Weekdays at 08:00 · Asks first',
			'Weekdays at 08:00 · Asks first · Finished'
		]);
	});

	it('says what a saved schedule does next', () => {
		expect([
			presentation.standing(scheduleBuilder(), false, mondayMorning),
			presentation.standing(scheduleBuilder(), true, mondayMorning),
			presentation.standing(scheduleBuilder({ status: 'paused' }), false, mondayMorning),
			presentation.standing(scheduleBuilder({ status: 'finished' }), false, mondayMorning)
		]).toEqual([
			'Next: tomorrow, 08:00.',
			'Next: tomorrow, 08:00. It is skipped if a run still waits for you then.',
			'Paused.',
			'Finished. Its time has passed.'
		]);
	});

	it('previews the next run of an unsaved recurrence', () => {
		expect([
			presentation.preview({ kind: 'at', at: tuesdayRun }, brussels, mondayMorning),
			presentation.preview(
				{ kind: 'at', at: instant('2026-11-20T15:00:00.000Z') },
				brussels,
				mondayMorning
			),
			presentation.preview({ kind: 'none' }, brussels, mondayMorning)
		]).toEqual(['Next: tomorrow, 08:00.', 'Next: Fri 20 Nov, 16:00.', 'This time has passed.']);
	});
});

describe('how one run of a schedule reads', () => {
	const ended = instant('2026-11-17T07:02:00.000Z');

	it('counts a finished run as opened only when it was opened after it ended', () => {
		const state = (openedAt?: string) =>
			presentation.runState(openedAt ? { openedAt: instant(openedAt) } : {}, {
				status: 'completed',
				updatedAt: ended,
				pendingChanges: 0
			});

		expect([state(), state('2026-11-17T07:01:00.000Z'), state('2026-11-17T09:00:00.000Z')]).toEqual(
			[
				{ kind: 'finished', outcome: 'completed', opened: false },
				{ kind: 'finished', outcome: 'completed', opened: false },
				{ kind: 'finished', outcome: 'completed', opened: true }
			]
		);
	});

	it('says what each state came to in one line', () => {
		const answer =
			'## Brief\n\n**Three things first:** reply to Dana, review the budget. Then the studio.';

		expect([
			presentation.line({ kind: 'working' }, undefined, undefined),
			presentation.line({ kind: 'waiting', changes: 1 }, undefined, undefined),
			presentation.line({ kind: 'waiting', changes: 2 }, undefined, undefined),
			presentation.line(
				{ kind: 'finished', outcome: 'failed', opened: false },
				'Linear needs you to sign in again.',
				undefined
			),
			presentation.line(
				{ kind: 'finished', outcome: 'cancelled', opened: true },
				undefined,
				answer
			),
			presentation.line(
				{ kind: 'finished', outcome: 'completed', opened: false },
				undefined,
				answer
			),
			presentation.line({ kind: 'finished', outcome: 'completed', opened: false }, undefined, '')
		]).toEqual([
			'Running now.',
			'Wants to make 1 change. Waiting for you.',
			'Wants to make 2 changes. Waiting for you.',
			'Linear needs you to sign in again.',
			'Stopped before it finished.',
			'Three things first: reply to Dana, review the budget.',
			'Finished without an answer.'
		]);
	});

	it('says when a run started, and when it was due if it started late', () => {
		const run = (createdAt: string, trigger: 'recurrence' | 'manual' = 'recurrence') =>
			presentation.ranAt(
				{ createdAt: instant(createdAt), scheduledFor: tuesdayRun, trigger },
				brussels,
				instant('2026-11-17T12:00:00.000Z')
			);

		expect([
			run('2026-11-17T07:00:20.000Z'),
			run('2026-11-17T08:41:00.000Z'),
			run('2026-11-17T08:41:00.000Z', 'manual')
		]).toEqual(['Today, 08:00', 'Today, 09:41 · due 08:00', 'Today, 09:41']);
	});
});
