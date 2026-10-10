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
