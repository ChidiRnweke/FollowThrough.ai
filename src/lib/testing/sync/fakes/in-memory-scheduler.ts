import type { SyncScheduler } from '$lib/client/sync/scheduler';

export class InMemorySyncScheduler implements SyncScheduler {
	private time = 0;
	private readonly tasks = new Set<{ at: number; work: () => Promise<void> }>();
	now(): number {
		return this.time;
	}
	schedule(at: number, work: () => Promise<void>): () => void {
		const task = { at, work };
		this.tasks.add(task);
		return () => {
			this.tasks.delete(task);
		};
	}
	async advance(milliseconds: number): Promise<void> {
		const end = this.time + milliseconds;
		let wakeups = 0;
		for (;;) {
			const next = [...this.tasks].filter((task) => task.at <= end).sort((a, b) => a.at - b.at)[0];
			if (!next) break;
			if (++wakeups > 100) throw new Error('Scheduler did not become idle');
			this.tasks.delete(next);
			this.time = next.at;
			await next.work();
		}
		this.time = end;
	}
}
