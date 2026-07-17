import { and, eq } from 'drizzle-orm';
import type { ActorContext, ExportSettings, ProjectId } from '$lib/models';
import { defaultExportSettings } from '$lib/models';
import type { ExportSettingsRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const toSettings = (stored: Record<string, unknown>): ExportSettings => ({
	...defaultExportSettings,
	...(stored as Partial<ExportSettings>)
});

export class PostgresExportSettingsRepository implements ExportSettingsRepository {
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
