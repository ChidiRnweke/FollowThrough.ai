import type { TimerHandle } from '$lib/models/maintenance';

/** One worker lifetime. Stopping is permanent, including before the first start. */
export class SchedulerStore {
	private phase: 'idle' | 'running' | 'stopped' = 'idle';
	private readonly timers = new Set<TimerHandle>();
	private readonly executions = new Set<Promise<void>>();
	get status(): 'idle' | 'running' | 'stopped' {
		return this.phase;
	}
	setStatus(status: 'running' | 'stopped'): void {
		this.phase = status;
	}
	addTimer(timer: TimerHandle): void {
		this.timers.add(timer);
	}
	removeTimer(timer: TimerHandle): void {
		this.timers.delete(timer);
	}
	pendingTimers(): readonly TimerHandle[] {
		return [...this.timers];
	}
	clearTimers(): void {
		this.timers.clear();
	}
	addExecution(execution: Promise<void>): void {
		this.executions.add(execution);
	}
	removeExecution(execution: Promise<void>): void {
		this.executions.delete(execution);
	}
	pendingExecutions(): readonly Promise<void>[] {
		return [...this.executions];
	}
}
