import { describe, expect, it } from 'vitest';
import type { WeeklyReads } from '$lib/models/context-usage';
import type { DateTime } from '$lib/models/workspace';
import { weeklyConclusion } from './weekly';

const week = (weekStart: string, reads: Partial<Omit<WeeklyReads, 'weekStart'>>): WeeklyReads => ({
	weekStart: weekStart as DateTime,
	note: 0,
	attachment: 0,
	memory: 0,
	skill: 0,
	...reads
});

describe('weekly conclusion', () => {
	it('names the busiest week, this week against last, and the kind read most', () => {
		const activity = [
			week('2026-09-21T00:00:00.000Z', { note: 84, attachment: 4, memory: 16, skill: 6 }),
			week('2026-09-28T00:00:00.000Z', { note: 140, attachment: 10, memory: 24, skill: 11 }),
			week('2026-10-05T00:00:00.000Z', { note: 92, attachment: 4, memory: 18, skill: 8 })
		];
		expect(weeklyConclusion(activity)).toEqual({
			busiest: { weekStart: '2026-09-28T00:00:00.000Z', reads: 185 },
			thisWeek: 122,
			lastWeek: 185,
			lead: { kind: 'note', percent: 76 }
		});
	});

	it('has no week to compare with when the first read was this week', () => {
		const conclusion = weeklyConclusion([week('2026-10-05T00:00:00.000Z', { skill: 3 })]);
		expect(conclusion?.lastWeek).toBeUndefined();
		expect(conclusion?.lead).toEqual({ kind: 'skill', percent: 100 });
	});

	it('counts a quiet week as zero rather than skipping it', () => {
		const conclusion = weeklyConclusion([
			week('2026-09-28T00:00:00.000Z', { note: 5 }),
			week('2026-10-05T00:00:00.000Z', {})
		]);
		expect(conclusion?.thisWeek).toBe(0);
		expect(conclusion?.lastWeek).toBe(5);
	});

	it('concludes nothing when the agent has read nothing', () => {
		expect(weeklyConclusion([])).toBeUndefined();
	});
});
