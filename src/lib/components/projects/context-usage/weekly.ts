import type { ContextItem, WeeklyReads } from '$lib/models/context-usage';

export const readKinds = [
	'note',
	'attachment',
	'memory',
	'skill'
] as const satisfies readonly ContextItem['kind'][];

export const weekTotal = (week: WeeklyReads): number =>
	week.note + week.attachment + week.memory + week.skill;

/** What the weekly chart lets a reader conclude, computed once so the sentence and the figures agree. */
export interface WeeklyConclusion {
	readonly busiest: { readonly weekStart: WeeklyReads['weekStart']; readonly reads: number };
	readonly thisWeek: number;
	/** Absent when the project's first read was this week: there is no week to compare with. */
	readonly lastWeek?: number;
	/** The kind with the most reads, and its share of all reads as a whole percentage. */
	readonly lead: { readonly kind: ContextItem['kind']; readonly percent: number };
}

/**
 * `activity` runs from the first week with a read to this week, gaps included, so its last entry
 * is this week and the one before it is last week. No activity means nothing to conclude.
 */
export function weeklyConclusion(activity: readonly WeeklyReads[]): WeeklyConclusion | undefined {
	const current = activity.at(-1);
	if (!current) return undefined;
	const busiest = activity.reduce((top, week) => (weekTotal(week) > weekTotal(top) ? week : top));
	const sums = readKinds.map((kind) => activity.reduce((sum, week) => sum + week[kind], 0));
	const all = sums.reduce((sum, value) => sum + value, 0);
	const leadIndex = sums.indexOf(Math.max(...sums));
	const previous = activity.at(-2);
	return {
		busiest: { weekStart: busiest.weekStart, reads: weekTotal(busiest) },
		thisWeek: weekTotal(current),
		...(previous ? { lastWeek: weekTotal(previous) } : {}),
		// A week enters `activity` only once the project has a read, so `all` is never zero here.
		lead: { kind: readKinds[leadIndex], percent: Math.round((sums[leadIndex] / all) * 100) }
	};
}
