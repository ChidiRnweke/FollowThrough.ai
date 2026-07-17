import type { ActorContext, ExportSettings, ProjectId, UserId } from '$lib/models';
import type { ExportSettingsRepository } from '$lib/repositories';

export class InMemoryExportSettingsRepository implements ExportSettingsRepository {
	rows: { userId: UserId; projectId: ProjectId; settings: ExportSettings }[] = [];

	async find(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings | undefined> {
		return this.rows.find((row) => row.userId === actor.userId && row.projectId === projectId)
			?.settings;
	}

	async upsert(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		this.rows = [
			...this.rows.filter((row) => row.userId !== actor.userId || row.projectId !== projectId),
			{ userId: actor.userId, projectId, settings }
		];
		return settings;
	}
}
