import { SpanStatusCode, trace } from '@opentelemetry/api';
import type {
	ScheduledTask,
	Scheduler,
	SchedulerClock,
	SchedulerState
} from '$lib/models/maintenance';

const tracer = trace.getTracer('followthrough-worker');

/**
 * Timer protocol for the worker. Each tick runs exactly one task, and a task reschedules only
 * after it settles; stop drains every active task. The worker entry point owns which tasks run.
 */
export class WorkerScheduler implements Scheduler {
	constructor(
		private readonly tasks: readonly ScheduledTask[],
		private readonly state: SchedulerState,
		private readonly clock: SchedulerClock,
		private readonly logger: Pick<Console, 'error' | 'info'>,
		private readonly runOnStart: boolean
	) {}
	start(): void {
		if (this.state.status !== 'idle') return;
		this.state.setStatus('running');
		for (const task of this.tasks) {
			if (this.runOnStart) this.execute(task);
			else this.schedule(task);
		}
	}
	async stop(): Promise<void> {
		this.state.setStatus('stopped');
		for (const timer of this.state.pendingTimers()) this.clock.clearTimeout(timer);
		this.state.clearTimers();
		await Promise.allSettled(this.state.pendingExecutions());
	}
	private execute(task: ScheduledTask): void {
		const running = this.tick(task).finally(() => {
			this.state.removeExecution(running);
			this.schedule(task);
		});
		this.state.addExecution(running);
	}
	private schedule(task: ScheduledTask): void {
		if (this.state.status !== 'running') return;
		const timer = this.clock.setTimeout(() => {
			this.state.removeTimer(timer);
			if (this.state.status === 'running') this.execute(task);
		}, task.intervalMs);
		this.state.addTimer(timer);
	}
	private async tick(task: ScheduledTask): Promise<void> {
		await tracer.startActiveSpan(`worker.${task.name}`, async (span) => {
			const startedAt = performance.now();
			// Info, not debug: ticks are the worker's whole story, and in prod debug
			// records are gated off (LOG_LEVEL), which would leave it silent.
			this.logger.info(`[worker] ${task.name} started`);
			try {
				await task.run();
				this.logger.info(
					`[worker] ${task.name} finished in ${Math.round(performance.now() - startedAt)}ms`
				);
				// audit-allow: silent-catch — scheduled task failure is recorded on its trace and log while the scheduler keeps later tasks alive.
			} catch (error) {
				span.setStatus({ code: SpanStatusCode.ERROR });
				span.recordException(error instanceof Error ? error : new Error(String(error)));
				this.logger.error(`[worker] ${task.name} failed:`, error);
			} finally {
				span.end();
			}
		});
	}
}
