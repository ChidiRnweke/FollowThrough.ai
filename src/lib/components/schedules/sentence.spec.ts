import { describe, expect, it } from 'vitest';
import type { IanaTimeZone, Recurrence } from '$lib/models/schedules';
import type { LocalDate } from '$lib/models/workspace';
import {
	clockValue,
	ordinal,
	rhythmLabel,
	rhythmOf,
	rhythmWord,
	timeOfClock,
	withRhythm
} from './sentence';

const brussels = 'Europe/Brussels' as IanaTimeZone;
const half = { hour: 16, minute: 30 };

describe('the first choice of the schedule sentence', () => {
	it('names a weekly recurrence by its day and every other one by its kind', () => {
		const recurrences: readonly Recurrence[] = [
			{ kind: 'weekly', weekday: 'fri', time: half },
			{ kind: 'weekdays', time: half },
			{ kind: 'once', date: '2026-12-01' as LocalDate, time: half }
		];

		expect(
			recurrences.map((recurrence) => [
				rhythmOf(recurrence),
				rhythmLabel(recurrence),
				rhythmWord(recurrence)
			])
		).toEqual([
			['fri', 'Every Friday', 'Friday'],
			['weekdays', 'Every weekday', 'weekday'],
			['once', 'Once', 'Once']
		]);
	});

	it('keeps the time of day when the rhythm changes', () => {
		const daily: Recurrence = { kind: 'daily', time: half };

		expect([
			withRhythm(daily, 'fri', brussels),
			withRhythm(daily, 'monthly', brussels),
			withRhythm(daily, 'hourly', brussels),
			withRhythm({ kind: 'hourly', minute: 15 }, 'daily', brussels)
		]).toEqual([
			{ kind: 'weekly', weekday: 'fri', time: half },
			{ kind: 'monthly', day: 1, time: half },
			{ kind: 'hourly', minute: 0 },
			{ kind: 'daily', time: { hour: 8, minute: 0 } }
		]);
	});

	it('keeps the date of a one-off schedule that stays one-off', () => {
		const once: Recurrence = { kind: 'once', date: '2026-12-01' as LocalDate, time: half };

		expect(withRhythm(once, 'once', brussels)).toEqual(once);
	});
});

describe('the small values of the schedule sentence', () => {
	it('reads a time input, and nothing from a half-typed one', () => {
		expect([
			timeOfClock('08:05'),
			timeOfClock('23:59'),
			timeOfClock('8:5'),
			timeOfClock('24:00')
		]).toEqual([{ hour: 8, minute: 5 }, { hour: 23, minute: 59 }, undefined, undefined]);
	});

	it('writes a time and a day of the month as a person reads them', () => {
		expect([
			clockValue({ hour: 8, minute: 5 }),
			ordinal(1),
			ordinal(12),
			ordinal(23),
			ordinal(31)
		]).toEqual(['08:05', '1st', '12th', '23rd', '31st']);
	});
});
