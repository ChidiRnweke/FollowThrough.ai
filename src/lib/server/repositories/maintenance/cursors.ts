import type { MaintenanceCursors, MaintenanceTask } from '$lib/models/maintenance';

export interface MaintenanceCursorRepository {
	find<Task extends MaintenanceTask>(task: Task): Promise<MaintenanceCursors[Task] | undefined>;
	save<Task extends MaintenanceTask>(task: Task, cursor: MaintenanceCursors[Task]): Promise<void>;
	remove(task: MaintenanceTask): Promise<void>;
}
