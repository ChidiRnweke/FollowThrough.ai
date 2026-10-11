import type { SchedulerClock, TimerHandle } from '$lib/models/maintenance';

/**
 * Runs queued callbacks on demand so tests drive ticks instead of waiting on
 * real timers.
 */
export class InMemorySchedulerClock implements SchedulerClock {
	private queue = new Map<TimerHandle, () => void>();
	private nextHandle = 1;

	setTimeout(callback: () => void): TimerHandle {
		const handle = this.nextHandle++;
		this.queue.set(handle, callback);
		return handle;
	}

	clearTimeout(handle: TimerHandle): void {
		this.queue.delete(handle);
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
