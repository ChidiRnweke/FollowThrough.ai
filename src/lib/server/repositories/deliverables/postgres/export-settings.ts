import { NotFoundError } from '$lib/errors';
import { projects } from '$lib/server/db/schema/notes';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { ExportSettings } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import { defaultExportSettings, exportSettingsOverlaySchema } from '$lib/models/deliverables';
import type { ExportSettingsRepository } from '$lib/server/repositories/deliverables';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/deliverables';

const toSettings = (stored: unknown): ExportSettings => ({
	...defaultExportSettings,
	...exportSettingsOverlaySchema.parse(stored)
});

export class ExportSettingsRecords implements ExportSettingsRepository {
	constructor(private readonly database: Database) {}

	async find(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.exportSettings)
			.where(
				and(
					eq(schema.exportSettings.userId, actor.userId),
					eq(schema.exportSettings.projectId, projectId)
				)
			);
		return row ? toSettings(row.settings) : undefined;
	}

	async upsert(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		const [project] = await this.database
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.id, projectId), eq(projects.userId, actor.userId)));
		if (!project) throw new NotFoundError('Project was not found');
		const [row] = await this.database
			.insert(schema.exportSettings)
			.values({ userId: actor.userId, projectId, settings: { ...settings } })
			.onConflictDoUpdate({
				target: [schema.exportSettings.userId, schema.exportSettings.projectId],
				set: { settings: { ...settings }, updatedAt: new Date() }
			})
			.returning();
		return toSettings(row!.settings);
	}
}
