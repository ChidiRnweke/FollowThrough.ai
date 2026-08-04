import { SpanStatusCode, trace } from '@opentelemetry/api';

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

/** Injected so tests can drive the loop without waiting on real time. */
export interface SchedulerClock {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface SchedulerOptions {
	readonly clock?: SchedulerClock;
	readonly logger?: Pick<Console, 'error' | 'info'>;
	/** Run every task once immediately instead of waiting out the first interval. */
	readonly runOnStart?: boolean;
}

const tracer = trace.getTracer('followthrough-worker');

const defaultClock: SchedulerClock = {
	setTimeout: (callback, ms) => setTimeout(callback, ms),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * Runs each task on its own self-rescheduling timer.
 *
 * The next tick is scheduled only after the previous one settles, so a task that
 * runs longer than its interval falls behind rather than overlapping itself —
 * important when the work is "embed everything outstanding" and a second copy
 * would duplicate API calls. A throwing task is logged and rescheduled; nothing
 * a task does can stop the loop.
 */
export const startScheduler = (
	tasks: readonly ScheduledTask[],
	options: SchedulerOptions = {}
): SchedulerHandle => {
	const clock = options.clock ?? defaultClock;
	const logger = options.logger ?? console;
	const timers = new Set<unknown>();
	const inFlight = new Set<Promise<void>>();
	let stopped = false;

	const tick = async (task: ScheduledTask): Promise<void> => {
		await tracer.startActiveSpan(`worker.${task.name}`, async (span) => {
			const startedAt = performance.now();
			// Info, not debug: ticks are the worker's whole story, and in prod debug
			// records are gated off (LOG_LEVEL), which would leave it silent.
			logger.info(`[worker] ${task.name} started`);
			try {
				await task.run();
				logger.info(
					`[worker] ${task.name} finished in ${Math.round(performance.now() - startedAt)}ms`
				);
			} catch (error) {
				span.setStatus({ code: SpanStatusCode.ERROR });
				span.recordException(error instanceof Error ? error : new Error(String(error)));
				logger.error(`[worker] ${task.name} failed:`, error);
			} finally {
				span.end();
			}
		});
	};

	const schedule = (task: ScheduledTask): void => {
		if (stopped) return;
		const timer = clock.setTimeout(() => {
			timers.delete(timer);
			if (stopped) return;
			const running = tick(task).finally(() => {
				inFlight.delete(running);
				schedule(task);
			});
			inFlight.add(running);
		}, task.intervalMs);
		timers.add(timer);
	};

	for (const task of tasks) {
		if (options.runOnStart) {
			const running = tick(task).finally(() => {
				inFlight.delete(running);
				schedule(task);
			});
			inFlight.add(running);
		} else schedule(task);
	}

	return {
		async stop() {
			stopped = true;
			for (const timer of timers) clock.clearTimeout(timer);
			timers.clear();
			await Promise.allSettled([...inFlight]);
		}
	};
};
