import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type DateTime = Brand<string, 'DateTime'>;

type AttachmentUploadId = Brand<string, 'AttachmentUploadId'>;

/**
 * A unit of periodic background work. Tasks are discovered from durable state on
 * every tick rather than handed to them, so a restart loses nothing and a missed
 * tick costs latency, not correctness.
 */
export interface ScheduledTask {
	readonly name: string;
	readonly intervalMs: number;
	run(): Promise<void>;
}

export interface SchedulerHandle {
	/** Resolves once the loop has stopped and any in-flight tick has finished. */
	stop(): Promise<void>;
}

/** Runs each task on its own interval. Each tick runs one task; ticks never sequence tasks. */
export interface Scheduler extends SchedulerHandle {
	start(): void;
}

/**
 * What a clock's `setTimeout` hands back.
 *
 * Node answers with a `Timeout` object; the browser — and a manual clock driving
 * ticks in a test — answers with a number. The scheduler never inspects the
 * value, it only hands it back to `clearTimeout`, and those two are everything
 * it can be. The port said `unknown` instead, and the default clock then
 * asserted the node arm back out of it, so the opacity bought nothing.
 */
export type TimerHandle = ReturnType<typeof setTimeout> | number;

/** Injected so tests can drive the loop without waiting on real time. */
export interface SchedulerClock {
	setTimeout(callback: () => void, ms: number): TimerHandle;
	clearTimeout(handle: TimerHandle): void;
}

export interface SchedulerOptions {
	readonly clock?: SchedulerClock;
	readonly logger?: Pick<Console, 'error' | 'info'>;
	/** Run every task once immediately instead of waiting out the first interval. */
	readonly runOnStart?: boolean;
}

/**
 * Where each maintenance task resumes its traversal on the next tick.
 *
 * A pass is bounded per tick, so the position outlives the tick and the worker process; it is
 * stored per task, and an absent position starts a fresh pass.
 */
export interface MaintenanceCursors {
	readonly 'embedding-backfill': { readonly after: string };
	readonly 'expired-upload-sweep': {
		readonly cutoff: DateTime;
		readonly after: { readonly expiresAt: DateTime; readonly id: AttachmentUploadId };
	};
}

export type MaintenanceTask = keyof MaintenanceCursors;

const dateTime = z.iso.datetime({ offset: true }).transform((value) => value as DateTime);

export const maintenanceCursorSchemas: {
	readonly [Task in MaintenanceTask]: z.ZodType<MaintenanceCursors[Task]>;
} = {
	'embedding-backfill': z.object({ after: z.string() }),
	'expired-upload-sweep': z.object({
		cutoff: dateTime,
		after: z.object({
			expiresAt: dateTime,
			id: z.string().transform((value) => value as AttachmentUploadId)
		})
	})
};
