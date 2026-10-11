import type { MaintenanceCursors, MaintenanceTask } from '$lib/models/maintenance';
import type { MaintenanceCursorRepository } from '$lib/server/repositories/maintenance/cursors';

export interface MaintenanceProgress {
	/** The position the task's current pass reached, or undefined to start a fresh pass. */
	resume<Task extends MaintenanceTask>(task: Task): Promise<MaintenanceCursors[Task] | undefined>;
	advance<Task extends MaintenanceTask>(
		task: Task,
		cursor: MaintenanceCursors[Task]
	): Promise<void>;
	/** Ends the task's pass, so the next tick starts from the beginning. */
	restart(task: MaintenanceTask): Promise<void>;
}

/** Keeps each maintenance task's traversal position across ticks and worker restarts. */
export class MaintenanceProgressService implements MaintenanceProgress {
	constructor(private readonly cursors: MaintenanceCursorRepository) {}

	resume<Task extends MaintenanceTask>(task: Task): Promise<MaintenanceCursors[Task] | undefined> {
		return this.cursors.find(task);
	}

	advance<Task extends MaintenanceTask>(
		task: Task,
		cursor: MaintenanceCursors[Task]
	): Promise<void> {
		return this.cursors.save(task, cursor);
	}

	restart(task: MaintenanceTask): Promise<void> {
		return this.cursors.remove(task);
	}
}
