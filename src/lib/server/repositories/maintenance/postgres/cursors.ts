import { eq } from 'drizzle-orm';
import {
	maintenanceCursorSchemas,
	type MaintenanceCursors,
	type MaintenanceTask
} from '$lib/models/maintenance';
import type { MaintenanceCursorRepository } from '$lib/server/repositories/maintenance/cursors';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/maintenance';

/** One row per task; an absent row is a task with no pass in progress. */
export class MaintenanceCursorRecords implements MaintenanceCursorRepository {
	constructor(private readonly db: Database) {}

	async find<Task extends MaintenanceTask>(
		task: Task
	): Promise<MaintenanceCursors[Task] | undefined> {
		const [row] = await this.db
			.select({ position: schema.maintenanceCursors.position })
			.from(schema.maintenanceCursors)
			.where(eq(schema.maintenanceCursors.task, task));
		if (!row) return undefined;
		const cursorSchema = maintenanceCursorSchemas[task];
		return cursorSchema.parse(row.position);
	}

	async save<Task extends MaintenanceTask>(
		task: Task,
		cursor: MaintenanceCursors[Task]
	): Promise<void> {
		await this.db
			.insert(schema.maintenanceCursors)
			.values({ task, position: cursor })
			.onConflictDoUpdate({
				target: schema.maintenanceCursors.task,
				set: { position: cursor, updatedAt: new Date() }
			});
	}

	async remove(task: MaintenanceTask): Promise<void> {
		await this.db.delete(schema.maintenanceCursors).where(eq(schema.maintenanceCursors.task, task));
	}
}
