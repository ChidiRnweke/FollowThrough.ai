import { describe, expect, it } from 'vitest';
import {
	startScheduler,
	type SchedulerClock,
	type ScheduledTask
} from '$lib/server/services/scheduler';

/**
 * Runs queued callbacks on demand so tests drive ticks instead of waiting on
 * real timers.
 */
class ManualClock implements SchedulerClock {
	private queue = new Map<number, () => void>();
	private nextHandle = 1;

	setTimeout(callback: () => void): unknown {
		const handle = this.nextHandle++;
		this.queue.set(handle, callback);
		return handle;
	}

	clearTimeout(handle: unknown): void {
		this.queue.delete(handle as number);
	}

	/** Fires everything currently queued, then lets the resulting promises settle. */
	async advance(): Promise<void> {
		const due = [...this.queue.entries()];
		this.queue.clear();
		for (const [, callback] of due) callback();
		await Promise.resolve();
		await Promise.resolve();
	}

	get pending(): number {
		return this.queue.size;
	}
}

const silent = { error: () => {} };

const countingTask = (name = 'counter'): ScheduledTask & { runs: number } => ({
	name,
	intervalMs: 1000,
	runs: 0,
	async run() {
		this.runs += 1;
	}
});

describe('Worker scheduler', () => {
	it('does not run a task before its first interval elapses', async () => {
		const clock = new ManualClock();
		const task = countingTask();

		startScheduler([task], { clock, logger: silent });

		expect(task.runs).toBe(0);
	});

	it('runs a task when its interval elapses', async () => {
		const clock = new ManualClock();
		const task = countingTask();
		startScheduler([task], { clock, logger: silent });

		await clock.advance();

		expect(task.runs).toBe(1);
	});

	it('reschedules itself after each tick', async () => {
		const clock = new ManualClock();
		const task = countingTask();
		startScheduler([task], { clock, logger: silent });

		await clock.advance();
		await clock.advance();

		expect(task.runs).toBe(2);
	});

	it('runs immediately when asked to start eagerly', async () => {
		const clock = new ManualClock();
		const task = countingTask();

		startScheduler([task], { clock, logger: silent, runOnStart: true });
		await Promise.resolve();

		expect(task.runs).toBe(1);
	});

	it('does not start a second tick while one is still running', async () => {
		const clock = new ManualClock();
		let started = 0;
		let release = () => {};
		const blocked: ScheduledTask = {
			name: 'blocked',
			intervalMs: 1000,
			run: () => {
				started += 1;
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			}
		};
		startScheduler([blocked], { clock, logger: silent });
		await clock.advance();

		await clock.advance();

		expect(started).toBe(1);
		release();
	});

	it('keeps running after a task throws', async () => {
		const clock = new ManualClock();
		let attempts = 0;
		const flaky: ScheduledTask = {
			name: 'flaky',
			intervalMs: 1000,
			run: async () => {
				attempts += 1;
				throw new Error('boom');
			}
		};
		startScheduler([flaky], { clock, logger: silent });

		await clock.advance();
		await clock.advance();

		expect(attempts).toBe(2);
	});

	it('schedules every task it is given', async () => {
		const clock = new ManualClock();
		const first = countingTask('first');
		const second = countingTask('second');
		startScheduler([first, second], { clock, logger: silent });

		await clock.advance();

		expect([first.runs, second.runs]).toEqual([1, 1]);
	});

	it('stops scheduling once stopped', async () => {
		const clock = new ManualClock();
		const task = countingTask();
		const handle = startScheduler([task], { clock, logger: silent });

		await handle.stop();
		await clock.advance();

		expect(task.runs).toBe(0);
	});

	it('waits for an in-flight tick before reporting stopped', async () => {
		const clock = new ManualClock();
		let finished = false;
		let release = () => {};
		const slow: ScheduledTask = {
			name: 'slow',
			intervalMs: 1000,
			run: () =>
				new Promise<void>((resolve) => {
					release = () => {
						finished = true;
						resolve();
					};
				})
		};
		const handle = startScheduler([slow], { clock, logger: silent });
		await clock.advance();

		const stopped = handle.stop();
		release();
		await stopped;

		expect(finished).toBe(true);
	});
});
