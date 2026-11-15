/**
 * Schedules: a prompt the worker runs for a user on a recurrence (ADR 0052).
 *
 * One occurrence of a schedule is a run. "Task" means something else twice over:
 * the worker's maintenance ticks, and the user's todos.
 */
import { z } from 'zod';
import type { AgentExecutionMode } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type { DateTime, LocalDate } from '$lib/models/workspace';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ScheduleId = Brand<string, 'ScheduleId'>;
/** A name the platform's time zone database knows, such as `Europe/Brussels`. */
export type IanaTimeZone = Brand<string, 'IanaTimeZone'>;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A wall-clock time, to the minute. A schedule cannot run more often than hourly. */
export interface TimeOfDay {
	readonly hour: number;
	readonly minute: number;
}

/** When a schedule runs, as wall-clock times in the schedule's time zone. */
export type Recurrence =
	| { readonly kind: 'once'; readonly date: LocalDate; readonly time: TimeOfDay }
	| { readonly kind: 'hourly'; readonly minute: number }
	| { readonly kind: 'daily'; readonly time: TimeOfDay }
	/** Monday to Friday. */
	| { readonly kind: 'weekdays'; readonly time: TimeOfDay }
	| { readonly kind: 'weekly'; readonly weekday: Weekday; readonly time: TimeOfDay }
	/** A day past the end of a month runs on that month's last day. */
	| { readonly kind: 'monthly'; readonly day: number; readonly time: TimeOfDay };

/** What a schedule runs and when. A tool can state this much and no more. */
export interface ScheduleContent {
	readonly title: string;
	readonly prompt: string;
	readonly recurrence: Recurrence;
	readonly timeZone: IanaTimeZone;
}

/** A schedule as its owner states it: the content, and whether a run asks before a change. */
export interface ScheduleDefinition extends ScheduleContent {
	readonly executionMode: AgentExecutionMode;
}

/** The parts of the content a caller wants to replace. */
export type ScheduleChanges = Partial<ScheduleContent>;

export type ScheduleState =
	| { readonly status: 'active'; readonly nextRunAt: DateTime }
	| { readonly status: 'paused' }
	/** A one-off schedule whose time has passed. */
	| { readonly status: 'finished' };

export type Schedule = ScheduleDefinition &
	ScheduleState & {
		readonly id: ScheduleId;
		readonly userId: UserId;
		readonly createdAt: DateTime;
		readonly updatedAt: DateTime;
	};

export type NextOccurrence =
	| { readonly kind: 'at'; readonly at: DateTime }
	/** Only a one-off recurrence whose time has passed has no next occurrence. */
	| { readonly kind: 'none' };

/** What a change to a schedule comes to. */
export type ScheduleDecision =
	| { readonly kind: 'scheduled'; readonly schedule: Schedule }
	| { readonly kind: 'no_future_occurrence' };

export const scheduleIdSchema = z.uuid().transform((value) => value as ScheduleId);

export const ianaTimeZoneSchema = z
	.string()
	.refine(
		(value) => {
			try {
				new Intl.DateTimeFormat('en', { timeZone: value });
				return true;
				// chisel-ignore fail-loudly:silent-catch -- Zod refine converts Intl's RangeError into an explicit validation failure.
			} catch {
				return false;
			}
		},
		{ message: 'The time zone must be an IANA name such as Europe/Brussels' }
	)
	.transform((value) => value as IanaTimeZone);

const timeOfDaySchema = z.strictObject({
	hour: z.number().int().min(0).max(23),
	minute: z.number().int().min(0).max(59)
});

export const recurrenceSchema: z.ZodType<Recurrence> = z.discriminatedUnion('kind', [
	z.strictObject({
		kind: z.literal('once'),
		date: z.iso.date().transform((value) => value as LocalDate),
		time: timeOfDaySchema
	}),
	z.strictObject({ kind: z.literal('hourly'), minute: timeOfDaySchema.shape.minute }),
	z.strictObject({ kind: z.literal('daily'), time: timeOfDaySchema }),
	z.strictObject({ kind: z.literal('weekdays'), time: timeOfDaySchema }),
	z.strictObject({ kind: z.literal('weekly'), weekday: z.enum(WEEKDAYS), time: timeOfDaySchema }),
	z.strictObject({
		kind: z.literal('monthly'),
		day: z.number().int().min(1).max(31),
		time: timeOfDaySchema
	})
]);

const scheduleContentShape = {
	title: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	recurrence: recurrenceSchema,
	timeZone: ianaTimeZoneSchema
};

export const scheduleDefinitionSchema = z.strictObject({
	...scheduleContentShape,
	executionMode: z.enum(['approval_required', 'auto_accept'])
});

export const scheduleChangesSchema = z.strictObject(scheduleContentShape).partial();

export const scheduleTargetSchema = z.strictObject({ scheduleId: scheduleIdSchema });

export const createScheduleSchema = z.strictObject({
	id: scheduleIdSchema,
	definition: scheduleDefinitionSchema
});

export const updateScheduleSchema = z.strictObject({
	scheduleId: scheduleIdSchema,
	changes: scheduleChangesSchema
});

export const setScheduleExecutionModeSchema = z.strictObject({
	scheduleId: scheduleIdSchema,
	executionMode: scheduleDefinitionSchema.shape.executionMode
});
