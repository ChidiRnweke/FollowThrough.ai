/**
 * Schedules: a prompt the worker runs for a user on a recurrence (ADR 0052).
 *
 * One occurrence of a schedule is a run. "Task" means something else twice over:
 * the worker's maintenance ticks, and the user's todos.
 */
import { z } from 'zod';
import type {
	AgentExecutionMode,
	AgentRunId,
	AgentRunReceipt,
	AgentRunStatus,
	ConversationId
} from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime, LocalDate } from '$lib/models/workspace';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ScheduleId = Brand<string, 'ScheduleId'>;
export type ScheduleOccurrenceId = Brand<string, 'ScheduleOccurrenceId'>;
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

/** What a schedule runs, when, and what each run starts with. A tool can state this much and no more. */
export interface ScheduleContent {
	readonly title: string;
	readonly prompt: string;
	readonly recurrence: Recurrence;
	readonly timeZone: IanaTimeZone;
	/** The project each run starts in. Absent: the whole workspace. */
	readonly projectId?: ProjectId;
	/** The model each run uses. Absent: its owner's default model when the run starts. */
	readonly model?: string;
	/** The skills each run loads before it acts, in the order they were added. */
	readonly skillNoteIds: readonly NoteId[];
}

/** A schedule as its owner states it: the content, and whether a run asks before a change. */
export interface ScheduleDefinition extends ScheduleContent {
	readonly executionMode: AgentExecutionMode;
}

/** The parts of the content a caller wants to replace. `null` removes the project or the model. */
export type ScheduleChanges = Partial<
	Pick<ScheduleContent, 'title' | 'prompt' | 'recurrence' | 'timeZone' | 'skillNoteIds'>
> & {
	readonly projectId?: ProjectId | null;
	readonly model?: string | null;
};

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

/**
 * One run of a schedule. Its id is also the request key of the agent run, so an occurrence
 * starts one run however often it is asked for.
 */
export interface ScheduleOccurrence {
	readonly id: ScheduleOccurrenceId;
	readonly userId: UserId;
	/** Absent once its schedule is deleted; the run and its chat stay. */
	readonly scheduleId?: ScheduleId;
	/** `recurrence`: the schedule's time came. `manual`: its owner asked for a run now. */
	readonly trigger: 'recurrence' | 'manual';
	/** The occurrence this run answers. */
	readonly scheduledFor: DateTime;
	readonly conversationId: ConversationId;
	readonly runId: AgentRunId;
	/** When its owner first opened the run's chat. */
	readonly openedAt?: DateTime;
	readonly createdAt: DateTime;
}

/** One run of a schedule with where the agent run has got to. */
export interface ScheduleRun extends ScheduleOccurrence {
	readonly status: AgentRunStatus;
}

/** Who is looking, and when: every date a schedule shows is relative to both. */
export interface ScheduleViewer {
	readonly now: DateTime;
	readonly timeZone: IanaTimeZone;
}

/** Where one run of a schedule has got to, as its owner needs to know it. */
export type ScheduledRunState =
	| { readonly kind: 'working' }
	/** Parked until its owner decides on the changes it wants to make. */
	| { readonly kind: 'waiting'; readonly changes: number }
	| {
			readonly kind: 'finished';
			readonly outcome: 'completed' | 'failed' | 'cancelled';
			/** Whether its owner has opened the chat since the run ended. */
			readonly opened: boolean;
	  };

/** One run of a schedule, as a list shows it. */
export interface ScheduledRunView {
	readonly occurrence: ScheduleOccurrence;
	readonly state: ScheduledRunState;
	/** What the run came to, in one line. */
	readonly line: string;
	/** When it started, on the clock of the schedule's time zone. */
	readonly ranAt: string;
}

/** A schedule in the list: what it is, and whether a run of it needs its owner. */
export interface ScheduleRow {
	readonly schedule: Schedule;
	/** "Weekdays at 08:00", then whether it asks first, then its next run. */
	readonly caption: string;
	readonly waiting: number;
	readonly unopened: number;
}

/** The project a schedule names, as this device knows it. */
export type ScheduleProjectView =
	| { readonly kind: 'active'; readonly id: ProjectId; readonly name: string }
	/** A run of the schedule fails until another project is chosen. */
	| { readonly kind: 'archived'; readonly id: ProjectId; readonly name: string }
	/** This device no longer holds the project. */
	| { readonly kind: 'deleted'; readonly id: ProjectId };

/** A skill a schedule names, as this device knows it. */
export type ScheduleSkillView =
	| { readonly kind: 'ready'; readonly noteId: NoteId; readonly name: string }
	/** Turned off, or in the trash. A run of the schedule fails until it is removed. */
	| { readonly kind: 'unavailable'; readonly noteId: NoteId; readonly name: string }
	| { readonly kind: 'deleted'; readonly noteId: NoteId };

/** What a schedule names for its runs, resolved to what its page can show. */
export interface ScheduleStartView {
	readonly project?: ScheduleProjectView;
	readonly skills: readonly ScheduleSkillView[];
}

export interface ScheduleDetail extends ScheduleRow {
	/** What happens next, such as "Next: tomorrow, 08:00." The sentence above it says the rest. */
	readonly standing: string;
	readonly start: ScheduleStartView;
	/** Every run it started, newest first. */
	readonly runs: readonly ScheduledRunView[];
}

/** A run that needs its owner: one that waits for approval, or one that ended unopened. */
export interface ScheduledRunNotice {
	readonly occurrenceId: ScheduleOccurrenceId;
	readonly conversationId: ConversationId;
	readonly title: string;
	readonly line: string;
	readonly ranAt: string;
}

export interface ScheduledAttention {
	readonly waiting: readonly ScheduledRunNotice[];
	readonly finished: readonly ScheduledRunNotice[];
	/** Runs that are queued or running now; their result is still to come. */
	readonly working: number;
}

/** The schedule behind a chat, for a chat that a schedule started. */
export interface ScheduledChat {
	readonly occurrence: ScheduleOccurrence;
	readonly title: string;
	readonly state: ScheduledRunState;
}

/** A schedule whose time has come, and the user it runs as. */
export interface DueSchedule {
	readonly owner: { readonly userId: UserId };
	readonly scheduleId: ScheduleId;
}

/** What the worker does with a schedule it found due. Each arm but `not_due` moves the schedule on. */
export type DueDecision =
	| { readonly kind: 'not_due' }
	/** An earlier run still waits for its owner's approval, so this occurrence does not run. */
	| { readonly kind: 'skipped'; readonly schedule: Schedule }
	| { readonly kind: 'due'; readonly scheduledFor: DateTime; readonly schedule: Schedule };

export type ScheduleRunStart =
	| { readonly kind: 'started'; readonly receipt: AgentRunReceipt }
	/** Too many runs executed at once, so the occurrence was saved as a failed run (ADR 0053). */
	| { readonly kind: 'refused'; readonly receipt: AgentRunReceipt }
	| { readonly kind: 'skipped' }
	| { readonly kind: 'not_due' };

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

const projectIdSchema = z.uuid().transform((value) => value as ProjectId);
const modelSchema = z.string().trim().min(1);
/** A skill is named once: a second mention of it would say nothing more. */
const skillNoteIdsSchema = z
	.array(z.uuid().transform((value) => value as NoteId))
	.refine((ids) => new Set(ids).size === ids.length, {
		message: 'A skill can be named once'
	})
	.readonly();

const scheduleTimingShape = {
	title: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	recurrence: recurrenceSchema,
	timeZone: ianaTimeZoneSchema
};

export const scheduleDefinitionSchema = z.strictObject({
	...scheduleTimingShape,
	projectId: projectIdSchema.optional(),
	model: modelSchema.optional(),
	skillNoteIds: skillNoteIdsSchema,
	executionMode: z.enum(['approval_required', 'auto_accept'])
});

export const scheduleChangesSchema = z
	.strictObject({
		...scheduleTimingShape,
		projectId: projectIdSchema.nullable(),
		model: modelSchema.nullable(),
		skillNoteIds: skillNoteIdsSchema
	})
	.partial();

export const scheduleTargetSchema = z.strictObject({ scheduleId: scheduleIdSchema });

export const createScheduleSchema = z.strictObject({
	id: scheduleIdSchema,
	definition: scheduleDefinitionSchema
});

export const updateScheduleSchema = z.strictObject({
	scheduleId: scheduleIdSchema,
	changes: scheduleChangesSchema
});

export const scheduledRunTargetSchema = z.strictObject({
	occurrenceId: z.uuid().transform((value) => value as ScheduleOccurrenceId)
});

export const runScheduleNowSchema = z.strictObject({
	scheduleId: scheduleIdSchema,
	/** The caller's key for this request: asking twice with one key starts one run. */
	requestId: z.uuid()
});

export const setScheduleExecutionModeSchema = z.strictObject({
	scheduleId: scheduleIdSchema,
	executionMode: scheduleDefinitionSchema.shape.executionMode
});
