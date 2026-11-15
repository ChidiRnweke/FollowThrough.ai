import { today } from '@internationalized/date';
import type { IanaTimeZone, Recurrence, TimeOfDay, Weekday } from '$lib/models/schedules';
import type { LocalDate } from '$lib/models/workspace';

/** The first choice in the sentence: how often. A weekly recurrence is chosen by its day. */
export type Rhythm = Exclude<Recurrence['kind'], 'weekly'> | Weekday;

/** What a schedule that repeats repeats on: the word the sentence shows after "Every". */
const REPEATING: readonly { readonly value: Exclude<Rhythm, 'once'>; readonly word: string }[] = [
	{ value: 'hourly', word: 'hour' },
	{ value: 'daily', word: 'day' },
	{ value: 'weekdays', word: 'weekday' },
	{ value: 'mon', word: 'Monday' },
	{ value: 'tue', word: 'Tuesday' },
	{ value: 'wed', word: 'Wednesday' },
	{ value: 'thu', word: 'Thursday' },
	{ value: 'fri', word: 'Friday' },
	{ value: 'sat', word: 'Saturday' },
	{ value: 'sun', word: 'Sunday' },
	{ value: 'monthly', word: 'month' }
];

/**
 * Every rhythm, with its two readings. `label` stands alone in the list of choices. `word` is
 * what the control shows inside the sentence, where "Every" is already written before it.
 */
export const RHYTHMS: readonly {
	readonly value: Rhythm;
	readonly label: string;
	readonly word: string;
}[] = [
	...REPEATING.map(({ value, word }) => ({ value, word, label: `Every ${word}` })),
	{ value: 'once', word: 'Once', label: 'Once' }
];

export const rhythmOf = (recurrence: Recurrence): Rhythm =>
	recurrence.kind === 'weekly' ? recurrence.weekday : recurrence.kind;

const chosenRhythm = (recurrence: Recurrence) => {
	const rhythm = rhythmOf(recurrence);
	const chosen = RHYTHMS.find((candidate) => candidate.value === rhythm);
	if (!chosen) throw new Error(`No label for the rhythm ${rhythm}`);
	return chosen;
};

export const rhythmLabel = (recurrence: Recurrence): string => chosenRhythm(recurrence).label;

/** The rhythm as the sentence shows it: "weekday" after "Every", or "Once" on its own. */
export const rhythmWord = (recurrence: Recurrence): string => chosenRhythm(recurrence).word;

/** Eight in the morning: the time a recurrence that has none yet starts from. */
const MORNING: TimeOfDay = { hour: 8, minute: 0 };

/**
 * The recurrence a new rhythm makes of the current one. The time of day carries over, so
 * moving from "every day" to "every Friday" keeps the hour the user already chose.
 */
export const withRhythm = (
	recurrence: Recurrence,
	rhythm: Rhythm,
	timeZone: IanaTimeZone
): Recurrence => {
	const time = recurrence.kind === 'hourly' ? MORNING : recurrence.time;
	switch (rhythm) {
		case 'hourly':
			return { kind: 'hourly', minute: recurrence.kind === 'hourly' ? recurrence.minute : 0 };
		case 'daily':
		case 'weekdays':
			return { kind: rhythm, time };
		case 'monthly':
			return { kind: 'monthly', day: recurrence.kind === 'monthly' ? recurrence.day : 1, time };
		case 'once':
			return {
				kind: 'once',
				date:
					recurrence.kind === 'once'
						? recurrence.date
						: (today(timeZone).add({ days: 1 }).toString() as LocalDate),
				time
			};
		default:
			return { kind: 'weekly', weekday: rhythm, time };
	}
};

/** `HH:MM`, as a time input holds it. */
export const clockValue = (time: TimeOfDay): string =>
	`${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;

/** The time a time input holds, or nothing while the input is half typed. */
export const timeOfClock = (value: string): TimeOfDay | undefined => {
	const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
	return match ? { hour: Number(match[1]), minute: Number(match[2]) } : undefined;
};

export const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export const ordinal = (day: number): string => {
	const suffix =
		day % 10 === 1 && day !== 11
			? 'st'
			: day % 10 === 2 && day !== 12
				? 'nd'
				: day % 10 === 3 && day !== 13
					? 'rd'
					: 'th';
	return `${day}${suffix}`;
};
