import type { LocalDate } from '$lib/models/workspace';

/** The device's calendar date; UTC can already be on another day. */
export function todayLocalDate(now = new Date()): LocalDate {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` as LocalDate;
}

const calendarFormatter = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC'
});

/** A date-only value has no time zone to convert. */
export function formatLocalDate(date: LocalDate): string {
	return calendarFormatter.format(new Date(date));
}
