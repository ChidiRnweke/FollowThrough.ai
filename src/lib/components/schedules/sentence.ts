import { today } from '@internationalized/date';
import type { IanaTimeZone, Recurrence, TimeOfDay, Weekday } from '$lib/models/schedules';
import type { LocalDate } from '$lib/models/workspace';

/** The first choice in the sentence: how often. A weekly recurrence is chosen by its day. */
export type Rhythm = Exclude<Recurrence['kind'], 'weekly'> | Weekday;

export const RHYTHMS: readonly { readonly value: Rhythm; readonly label: string }[] = [
	{ value: 'hourly', label: 'Every hour' },
	{ value: 'daily', label: 'Every day' },
	{ value: 'weekdays', label: 'Every weekday' },
	{ value: 'mon', label: 'Every Monday' },
	{ value: 'tue', label: 'Every Tuesday' },
	{ value: 'wed', label: 'Every Wednesday' },
	{ value: 'thu', label: 'Every Thursday' },
	{ value: 'fri', label: 'Every Friday' },
	{ value: 'sat', label: 'Every Saturday' },
	{ value: 'sun', label: 'Every Sunday' },
	{ value: 'monthly', label: 'Every month' },
	{ value: 'once', label: 'Once' }
];

export const rhythmOf = (recurrence: Recurrence): Rhythm =>
	recurrence.kind === 'weekly' ? recurrence.weekday : recurrence.kind;

export const rhythmLabel = (recurrence: Recurrence): string => {
	const rhythm = rhythmOf(recurrence);
	const chosen = RHYTHMS.find((candidate) => candidate.value === rhythm);
	if (!chosen) throw new Error(`No label for the rhythm ${rhythm}`);
	return chosen.label;
};

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
