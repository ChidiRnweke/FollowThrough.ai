import type { MaintenanceCursors, MaintenanceTask } from '$lib/models/maintenance';
import type { MaintenanceCursorRepository } from '$lib/server/repositories/maintenance/cursors';

export class InMemoryMaintenanceCursors implements MaintenanceCursorRepository {
	private readonly rows: { -readonly [Task in MaintenanceTask]?: MaintenanceCursors[Task] } = {};

	async find<Task extends MaintenanceTask>(
		task: Task
	): Promise<MaintenanceCursors[Task] | undefined> {
		return this.rows[task];
	}

	async save<Task extends MaintenanceTask>(
		task: Task,
		cursor: MaintenanceCursors[Task]
	): Promise<void> {
		this.rows[task] = cursor;
	}

	async remove(task: MaintenanceTask): Promise<void> {
		delete this.rows[task];
	}
}
