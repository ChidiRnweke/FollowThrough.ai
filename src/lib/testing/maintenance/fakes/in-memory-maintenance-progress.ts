import type { MaintenanceCursors, MaintenanceTask } from '$lib/models/maintenance';
import type { MaintenanceProgress } from '$lib/server/services/maintenance/progress';

export class InMemoryMaintenanceProgress implements MaintenanceProgress {
	private readonly cursors: { -readonly [Task in MaintenanceTask]?: MaintenanceCursors[Task] } = {};

	async resume<Task extends MaintenanceTask>(
		task: Task
	): Promise<MaintenanceCursors[Task] | undefined> {
		return this.cursors[task];
	}

	async advance<Task extends MaintenanceTask>(
		task: Task,
		cursor: MaintenanceCursors[Task]
	): Promise<void> {
		this.cursors[task] = cursor;
	}

	async restart(task: MaintenanceTask): Promise<void> {
		delete this.cursors[task];
	}
}
