import type {
	ScheduledTask,
	Scheduler,
	SchedulerClock,
	SchedulerOptions
} from '$lib/models/maintenance';
import { WorkerScheduler } from '$lib/server/adapters/maintenance/scheduler';
import { SchedulerStore } from '$lib/server/stores/maintenance/scheduler';

const clock: SchedulerClock = {
	setTimeout: (callback, ms) => setTimeout(callback, ms),
	clearTimeout: (handle) => clearTimeout(handle)
};
export const createScheduler = (
	tasks: readonly ScheduledTask[],
	options: SchedulerOptions = {}
): Scheduler =>
	new WorkerScheduler(
		tasks,
		new SchedulerStore(),
		options.clock ?? clock,
		options.logger ?? console,
		options.runOnStart ?? false
	);
