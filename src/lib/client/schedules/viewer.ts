import type { IanaTimeZone, ScheduleViewer } from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';

/** The time zone this browser reports; it comes from the platform's own zone database. */
export const browserTimeZone = (): IanaTimeZone =>
	Intl.DateTimeFormat().resolvedOptions().timeZone as IanaTimeZone;

/** The person at this browser, now: the clock every schedule date is read against. */
export const scheduleViewer = (): ScheduleViewer => ({
	now: new Date().toISOString() as DateTime,
	timeZone: browserTimeZone()
});
